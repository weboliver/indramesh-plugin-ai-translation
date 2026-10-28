"""Bounded ``ctx.llm`` field generation into validated private proposals (307-02).

Provider-neutral by construction (Carry-01): the ONLY provider access is
``ctx.llm``. The module turns one authorized translation scope into the set of
genuinely missing enabled target pairs and asks the facade for a strict,
structured completion. Nothing is written here — the caller persists only the
validated proposals, and generation NEVER writes a Core translation (the tracer
proof).

Bounding and safety (D-10, T-307-08):

* at most ONE internal structured retry inside a cooperative 50-second deadline;
* strict input/output shapes plus a per-item cap, so a hostile model response
  cannot become an unbounded payload;
* malformed/unknown/duplicate response pairs are REJECTED without last-wins;
* typed failures map to a FIXED ``(status, code, message)`` — raw exception text,
  provider bodies, prompts and keys are never serialized or logged;
* a client cancellation is propagated, never swallowed.
"""

import asyncio
import dataclasses

from indramesh.sdk import (
    LLMAuthFailed,
    LLMConfigError,
    LLMError,
    LLMModelNotFound,
    LLMNotConfigured,
    LLMRateLimited,
    LLMResponseInvalid,
    LLMTimeout,
    LLMUnreachable,
)

from .schemas import FieldGenerationOutput

# One user-triggered call, at most one internal structured retry, bounded by one
# cooperative deadline over the awaited facade call.
GENERATION_DEADLINE_SECONDS = 50.0
GENERATION_MAX_RETRIES = 1
GENERATION_TEMPERATURE = 0.2

_MESSAGES = {
    "not_configured": "AI generation is not configured.",
    "misconfigured": "AI generation is not set up correctly.",
    "not_eligible": "This field is not available for AI translation.",
    "rate_limited": "The AI service is limiting requests. Try again in a moment.",
    "timeout": "The AI service did not answer in time. Try again.",
    "unreachable": "The AI service could not be reached. Try again in a moment.",
    "invalid_result": "The AI response could not be turned into valid suggestions.",
    "unexpected": "The generation stopped unexpectedly.",
}


class GenerationFailure(Exception):
    """A fixed, safe generation failure (status + code + message, no raw text)."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


_UNUSABLE = (LLMNotConfigured, LLMConfigError, LLMAuthFailed, LLMModelNotFound)


def _failure_for(exc: BaseException) -> GenerationFailure:
    """Map any typed/unexpected failure to a fixed ``GenerationFailure``.

    Never includes ``str(exc)`` — the classification decides a fixed code and a
    fixed English server message only (T-307-08).
    """
    if isinstance(exc, LLMNotConfigured):
        return GenerationFailure(503, "not_configured", _MESSAGES["not_configured"])
    if isinstance(exc, (LLMConfigError, LLMAuthFailed, LLMModelNotFound)):
        return GenerationFailure(503, "misconfigured", _MESSAGES["misconfigured"])
    if isinstance(exc, LLMRateLimited):
        return GenerationFailure(429, "rate_limited", _MESSAGES["rate_limited"])
    if isinstance(exc, (LLMTimeout, TimeoutError)):
        return GenerationFailure(504, "timeout", _MESSAGES["timeout"])
    if isinstance(exc, LLMUnreachable):
        return GenerationFailure(502, "unreachable", _MESSAGES["unreachable"])
    if isinstance(exc, (LLMResponseInvalid, LLMError)):
        return GenerationFailure(422, "invalid_result", _MESSAGES["invalid_result"])
    return GenerationFailure(500, "unexpected", _MESSAGES["unexpected"])


class MissingTarget:
    """One requested missing target pair plus its authored default-language source."""

    __slots__ = ("field", "language_code", "source_text")

    def __init__(self, field: str, language_code: str, source_text: str) -> None:
        self.field = field
        self.language_code = language_code
        self.source_text = source_text


@dataclasses.dataclass(frozen=True)
class AcceptedProposal:
    """One validated proposal ready to persist, with its authored source text."""

    field: str
    language_code: str
    text: str
    source_text: str



def missing_targets(scope) -> list[MissingTarget]:
    """The genuinely missing enabled target pairs of one authorized scope.

    A pair is missing only when the scope carries an authored source value for the
    field (the base a suggestion translates) AND the raw stored target for that
    language is absent/empty. Existing stored targets are never re-proposed.
    """
    default_code = scope.default_language_code
    targets: list[MissingTarget] = []
    for field, source_value in sorted(scope.fields.items()):
        if not source_value:
            continue
        for language_code in scope.enabled_target_languages:
            if language_code == default_code:
                continue
            stored = (scope.stored_targets or {}).get(field, {}).get(language_code)
            if stored:
                continue
            targets.append(MissingTarget(field, language_code, source_value))
    return targets


def _build_messages(scope, targets: list[MissingTarget]) -> list[dict]:
    """A bounded, provider-neutral prompt naming only the requested pairs.

    The authored source text is the ONLY data sent; the prompt carries no Core id
    beyond the field noun, no actor and no other record's content.
    """
    lines = [
        "Translate the following field values into each requested target language.",
        "Return one proposal per requested (field, language) pair and nothing else.",
    ]
    for target in targets:
        lines.append(
            f"- field={target.field} language={target.language_code} "
            f"source={target.source_text!r}"
        )
    return [
        {"role": "system", "content": "You translate structured asset field values."},
        {"role": "user", "content": "\n".join(lines)},
    ]


def _accepted_proposals(
    output: FieldGenerationOutput, targets: list[MissingTarget]
) -> list[AcceptedProposal]:
    """Keep only proposals matching a requested pair, rejecting duplicates.

    Unknown, malformed and duplicate response pairs are dropped without
    last-wins: the first valid proposal for a requested pair wins and a second
    one for the same pair is discarded, never used to overwrite it (D-10).
    """
    by_key = {(target.field, target.language_code): target for target in targets}
    accepted: list[AcceptedProposal] = []
    seen: set[tuple[str, str]] = set()
    for proposal in output.proposals:
        key = (proposal.field, proposal.language_code)
        target = by_key.get(key)
        if target is None:
            continue
        if key in seen:
            continue
        if not proposal.text.strip():
            continue
        seen.add(key)
        accepted.append(
            AcceptedProposal(
                field=proposal.field,
                language_code=proposal.language_code,
                text=proposal.text,
                source_text=target.source_text,
            )
        )
    return accepted


def field_eligible(scope) -> bool:
    """The per-field eligibility gate (D-05), preserved separately per noun.

    The metadata route for ``object_type_attribute`` requires the multilingual
    PARENT, while the schema collector later also requires the attribute's own
    flag; option/value generation retains the own+parent gates; status and
    reference_type keep their original (always-eligible) envelope. This is
    deliberately NOT the schema-bulk selection rule.
    """
    translation_type = scope.translation_type
    if translation_type == "object_type":
        return bool(scope.own_multilingual)
    if translation_type == "object_type_attribute":
        return bool(scope.parent_multilingual)
    if translation_type in ("select_option", "object_value"):
        return bool(scope.own_multilingual) and bool(scope.parent_multilingual)
    if translation_type in ("status", "reference_type", "systemui"):
        return True
    return False


async def generate_field(ctx, scope) -> list[AcceptedProposal]:
    """One bounded ``ctx.llm`` completion into validated proposals (D-01/D-10).

    Returns only the accepted proposals for genuinely missing requested pairs. An
    already-complete scope returns an empty list WITHOUT calling the provider.
    """
    if not field_eligible(scope):
        raise GenerationFailure(422, "not_eligible", _MESSAGES["not_eligible"])
    targets = missing_targets(scope)
    if not targets:
        return []
    messages = _build_messages(scope, targets)
    try:
        async with asyncio.timeout(GENERATION_DEADLINE_SECONDS):
            output = await ctx.llm.generate_structured(
                messages=messages,
                response_model=FieldGenerationOutput,
                temperature=GENERATION_TEMPERATURE,
                max_retries=GENERATION_MAX_RETRIES,
            )
            return _accepted_proposals(output, targets)
    except asyncio.CancelledError:
        raise
    except GenerationFailure:
        raise
    except Exception as exc:  # noqa: BLE001 - mapped to a fixed safe failure
        raise _failure_for(exc) from None
