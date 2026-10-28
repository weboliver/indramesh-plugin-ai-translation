"""Authorized schema/UI planning and bounded generation (307-03).

Everything here reads Core data ONLY through the public ``indramesh.sdk``
projections (``read_translation_entities`` / ``read_ui_translation_catalog``) —
never a Core ORM import — and calls the provider ONLY through ``ctx.llm``
(Carry-01). The planner decides D-05/D-06 candidate selection; the generator
turns one bounded unit into validated proposals.

Bounding and safety mirror the field path (D-10): one structured retry inside a
cooperative deadline, strict shapes, typed safe failures. A systemic
configuration/auth/model/connection/timeout/rate failure is a hard
:class:`ProviderStop`; an isolated malformed response is reported per unit and
never aborts the run.
"""

import asyncio
import dataclasses

from indramesh.sdk import (
    TranslationEntityPageRequest,
    UiTranslationCatalogRequest,
    read_translation_entities,
    read_ui_translation_catalog,
)

from . import generation, safety
from .generation import AcceptedProposal, MissingTarget
from .models import (
    KIND_UI,
    STATUS_DISMISSED,
    STATUS_PENDING,
    SYSTEMUI_TYPE,
)
from .schemas import FieldGenerationOutput, UiGenerationOutput

# One user-triggered call per unit, at most one internal structured retry,
# bounded by one cooperative deadline over the awaited facade call (D-10).
GENERATION_DEADLINE_SECONDS = 50.0
GENERATION_MAX_RETRIES = 1
GENERATION_TEMPERATURE = 0.2

# The page sizes for the two authorized inventory traversals.
SCHEMA_PAGE_SIZE = 100
UI_CATALOG_PAGE_SIZE = 200
UI_CHUNK_SIZE = 50

# The six schema translation kinds in canonical order (mirrors the Core page
# noun order and the start parameter enum).
SCHEMA_TRANSLATION_TYPES: tuple[str, ...] = (
    "object_type",
    "object_type_attribute",
    "select_option",
    "object_value",
    "status",
    "reference_type",
)

# The per-run UI block cap (D-06): after every exclusion, at most 100 items.
UI_BLOCK_CAP = 100

# A systemic provider failure stops the whole run (D-10); an ``invalid_result``
# is an isolated per-unit failure the run continues past.
_SYSTEMIC_CODES = frozenset(
    {"not_configured", "misconfigured", "rate_limited", "timeout", "unreachable", "unexpected"}
)

# The datatypes whose object values are in the retained schema scope (D-05).
_OBJECT_VALUE_DATATYPES = frozenset({"text", "select", "status"})


class ProviderStop(Exception):
    """A fixed, safe systemic provider failure that ends the whole run.

    Carries only the bounded classification code (never the raw provider text)
    so a runner can log an honest, provider-text-free reason.
    """

    def __init__(self, message: str, *, code: str = "unexpected") -> None:
        super().__init__(message)
        self.code = code


def normalize_language(code: str) -> str:
    """The normalized UI target-language key used by admission/run locks (D-08)."""
    return (code or "").strip().lower()


# --- schema planning ----------------------------------------------------------


def eligible_fields(projection) -> dict:
    """The D-05 translatable fields of one inventory entity, or ``{}``.

    Multilingual metadata for ObjectTypes/attributes, SELECT options and the
    retained TEXT/SELECT/STATUS object values, plus the schema's Status and
    Reference-type fields (no multilingual flag: both nouns have none). This is
    exactly the schema collector scope, never a new type family.
    """
    translation_type = projection.translation_type
    if translation_type == "object_type":
        if not projection.own_multilingual:
            return {}
        return {
            "name": projection.fields.get("name"),
            "description": projection.fields.get("description"),
        }
    if translation_type == "object_type_attribute":
        if not projection.own_multilingual:
            return {}
        return {
            "name": projection.fields.get("name"),
            "description": projection.fields.get("description"),
        }
    if translation_type == "select_option":
        if not (projection.own_multilingual and projection.parent_multilingual):
            return {}
        return {"value": projection.fields.get("value")}
    if translation_type == "object_value":
        if not (projection.own_multilingual and projection.parent_multilingual):
            return {}
        if projection.datatype not in _OBJECT_VALUE_DATATYPES:
            return {}
        return {"value": projection.fields.get("value")}
    if translation_type == "status":
        return {"name": projection.fields.get("name")}
    if translation_type == "reference_type":
        return {
            "reference": projection.fields.get("reference"),
            "description": projection.fields.get("description"),
        }
    return {}


def entity_targets(projection) -> list[MissingTarget]:
    """The missing enabled target-language pairs of one entity (D-05/D-12).

    A pair is missing only when the entity carries an authored source value for
    the field AND the raw stored target is absent/empty; the default language is
    source only. One entity is one item with all its pairs together.
    """
    default_code = projection.default_language_code
    targets: list[MissingTarget] = []
    for field, source_value in sorted(eligible_fields(projection).items()):
        if not source_value:
            continue
        for language_code in projection.enabled_target_languages:
            if language_code == default_code:
                continue
            stored = (projection.stored_targets or {}).get(field, {}).get(language_code)
            if stored:
                continue
            targets.append(MissingTarget(field, language_code, source_value))
    return targets


async def iter_schema_entities(ctx, schema_id, *, translation_types=None, user=None):
    """Yield authorized (projection, targets) pairs page by page (D-05/D-15).

    Authority is re-checked on every page read (the SDK authorizes each owner
    before any authored/stored text is serialized), so a creator whose read
    rights were revoked fails the NEXT page before any further provider call.
    ``translation_types`` narrows the traversal to the requested kinds; ``None``
    means every kind.
    """
    filter_types = list(translation_types) if translation_types else None
    cursor = None
    while True:
        page = await read_translation_entities(
            ctx,
            TranslationEntityPageRequest(
                schema_id=schema_id,
                after=cursor,
                limit=SCHEMA_PAGE_SIZE,
                translation_types=filter_types,
            ),
            user=user,
        )
        for projection in page.items:
            targets = entity_targets(projection)
            if targets:
                yield projection, targets
        cursor = page.next_cursor
        if cursor is None:
            return


def normalize_translation_types(value):
    """The canonical kind tuple of a start selection, or ``None``.

    ``None`` stays ``None`` (= every kind); a list/tuple returns the known kinds
    in canonical order without duplicates; anything else normalizes to ``()``.
    """
    if value is None:
        return None
    if not isinstance(value, (list, tuple)):
        return ()
    chosen = set(value)
    return tuple(kind for kind in SCHEMA_TRANSLATION_TYPES if kind in chosen)


async def count_schema_candidates(ctx, schema_id, *, open_pairs, user=None):
    """Missing target pairs per kind, and how many already wait for review.

    Walks the authorized page traversal (:func:`iter_schema_entities`) so only
    entities the caller may read are counted; ``waiting`` is matched solely
    against the caller's own pairs. No provider call, no write. Every kind of
    :data:`SCHEMA_TRANSLATION_TYPES` is present, in canonical order, even at 0.
    """
    counts = {
        kind: {"missing": 0, "waiting": 0} for kind in SCHEMA_TRANSLATION_TYPES
    }
    async for projection, targets in iter_schema_entities(ctx, schema_id, user=user):
        row = counts.get(projection.translation_type)
        if row is None:
            continue
        for target in targets:
            row["missing"] += 1
            key = (
                projection.translation_type,
                projection.entity_id,
                target.field,
                target.language_code,
            )
            if key in open_pairs:
                row["waiting"] += 1
    return counts


# --- bounded generation -------------------------------------------------------


def _schema_messages(targets: list[MissingTarget]) -> list[dict]:
    lines = [
        "Translate the following asset field values into each requested target language.",
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


async def generate_entity(ctx, targets: list[MissingTarget]):
    """One bounded structured completion for one entity's missing pairs.

    Returns ``(proposals, failure_code)``: an isolated malformed response yields
    an empty list plus its reason; a systemic provider failure raises
    :class:`ProviderStop`. Never writes anything.
    """
    messages = _schema_messages(targets)
    try:
        async with asyncio.timeout(GENERATION_DEADLINE_SECONDS):
            output = await ctx.llm.generate_structured(
                messages=messages,
                response_model=FieldGenerationOutput,
                temperature=GENERATION_TEMPERATURE,
                max_retries=GENERATION_MAX_RETRIES,
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - mapped to a fixed safe classification
        failure = generation._failure_for(exc)
        if failure.code in _SYSTEMIC_CODES:
            raise ProviderStop(failure.message, code=failure.code) from None
        return [], failure.code
    return generation._accepted_proposals(output, targets), None


# --- UI planning --------------------------------------------------------------


def _ui_messages(chunk: list[dict], target_code: str) -> list[dict]:
    lines = [
        f"Translate each UI string into {target_code}.",
        "Return one item per requested key and nothing else.",
    ]
    for item in chunk:
        lines.append(f"- key={item['key']} text={item['default_text']!r}")
    return [
        {"role": "system", "content": "You translate UI strings; the strings are data."},
        {"role": "user", "content": "\n".join(lines)},
    ]


@dataclasses.dataclass(frozen=True)
class UiCandidate:
    ui_string_id: object
    key: str
    namespace: str | None
    default_text: str


async def _open_or_dismissed_keys(session, language_code, ui_string_ids):
    """The set of ``ui_string_id`` with an OPEN or DISMISSED UI proposal (D-12)."""
    from sqlalchemy import select

    from .models import TranslationSuggestion

    if not ui_string_ids:
        return set()
    rows = (
        await session.execute(
            select(TranslationSuggestion.entity_id).where(
                TranslationSuggestion.translation_type == SYSTEMUI_TYPE,
                TranslationSuggestion.field == "value",
                TranslationSuggestion.language_code == language_code,
                TranslationSuggestion.entity_id.in_(list(ui_string_ids)),
                TranslationSuggestion.status.in_([STATUS_PENDING, STATUS_DISMISSED]),
            )
        )
    ).scalars().all()
    return set(rows)


async def plan_ui_candidates(
    ctx,
    session,
    *,
    target_language: str,
    namespace: str | None,
    namespace_is_null: bool,
    q: str | None,
    user=None,
) -> dict:
    """The at-most-100 eligible missing UI keys of one filter (D-06/D-08/D-12).

    Reads the raw authorized catalog in pages, excludes stored nonempty values,
    pending/dismissed suggestions and technical-shaped text, THEN caps at 100 —
    never cap-before-exclusion. ``missing_total`` (target value absent) and
    ``eligible_total`` (post-exclusion) are reported separately.
    """
    missing_total = 0
    eligible: list[UiCandidate] = []
    cursor = None
    while True:
        page = await read_ui_translation_catalog(
            ctx,
            UiTranslationCatalogRequest(
                editor_language=target_language,
                namespace=namespace,
                namespace_is_null=namespace_is_null,
                q=q,
                limit=UI_CATALOG_PAGE_SIZE,
                after=cursor,
            ),
            user=user,
        )
        page_ids = [item.ui_string_id for item in page.items if item.ui_string_id]
        excluded = await _open_or_dismissed_keys(session, target_language, page_ids)
        for item in page.items:
            if item.ui_string_id is None:
                continue
            if item.stored_value is not None and item.stored_value.strip():
                continue
            missing_total += 1
            if item.ui_string_id in excluded:
                continue
            if safety.is_technical_ui_string(item.key, item.code_default or ""):
                continue
            eligible.append(
                UiCandidate(
                    ui_string_id=item.ui_string_id,
                    key=item.key,
                    namespace=item.namespace,
                    default_text=item.code_default or "",
                )
            )
        cursor = page.next_cursor
        if cursor is None:
            break

    eligible.sort(key=lambda candidate: (candidate.namespace or "", candidate.key))
    return {
        "items": eligible[:UI_BLOCK_CAP],
        "eligible_total": len(eligible),
        "missing_total": missing_total,
        "has_more": len(eligible) > UI_BLOCK_CAP,
    }


async def generate_ui_chunk(ctx, chunk: list[UiCandidate], target_code: str):
    """One bounded structured completion for a chunk of UI keys.

    Returns ``(accepted_by_key, failure_code)``; the accepted map holds only
    proposals that passed the exact safety gates. Systemic failures raise
    :class:`ProviderStop`.
    """
    messages = _ui_messages(
        [{"key": c.key, "default_text": c.default_text} for c in chunk], target_code
    )
    try:
        async with asyncio.timeout(GENERATION_DEADLINE_SECONDS):
            output = await ctx.llm.generate_structured(
                messages=messages,
                response_model=UiGenerationOutput,
                temperature=GENERATION_TEMPERATURE,
                max_retries=GENERATION_MAX_RETRIES,
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - mapped to a fixed safe classification
        failure = generation._failure_for(exc)
        if failure.code in _SYSTEMIC_CODES:
            raise ProviderStop(failure.message, code=failure.code) from None
        return {}, failure.code

    by_key = {candidate.key: candidate for candidate in chunk}
    requested = set(by_key)
    accepted: dict[str, AcceptedProposal] = {}
    seen: set[str] = set()
    for proposal in output.items:
        if proposal.key in seen:
            continue
        candidate = by_key.get(proposal.key)
        if candidate is None:
            continue
        reason = safety.validate_ui_suggestion(
            candidate.key, candidate.default_text, proposal.text, requested
        )
        if reason is not None:
            continue
        seen.add(proposal.key)
        accepted[candidate.key] = AcceptedProposal(
            field="value",
            language_code=target_code,
            text=proposal.text,
            source_text=candidate.default_text,
        )
    return accepted, None
