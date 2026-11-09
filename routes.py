"""The ai-translation plugin's HTTP surface (Phase 307, AITR-01).

Every route runs UNDER the Core mount chain (authentication +
``plugin-runtime:use`` + active-state) and adds its OWN business permission:

* the data routes carry ``require_permission('ai-translation','data')``;
* ``GET /ui/status`` carries ``require_permission('ai-translation','ui')``.

Contract:

* ``GET /data/status`` -> ``{available, open_count}``. Core authorization
  precedes availability (D-15): the caller's scope authority is resolved first,
  then ``ctx.llm.is_configured()`` is read (never a provider probe, D-16).
* ``POST /data/generate`` -> the open proposals after a bounded ``ctx.llm``
  call; persists ONLY genuinely missing pairs and NEVER writes a translation.
* ``GET /data/suggestions`` -> the caller's open proposals for one scope.
* ``GET /data/schema-candidates`` -> missing translations per kind for the
  schema section (counted over authorized entities only).
* ``POST /data/apply`` -> an explicit ``fill_missing`` commit of reviewed drafts.
* ``DELETE /data/suggestions/{id}`` -> discard one owned data proposal.
* ``GET /ui/status`` -> UI availability + open UI proposal count.

The two schema-scoped aggregates (``/data/open-count`` and ``/data/runs``) also
resolve the caller's RECORD-level ``read`` decision for the given schema through
the plugin SDK, BEFORE they touch that schema's data (D-07): a record DENY
answers the fixed 403 ``not_authorized`` and never a zero count or a
run-specific 404 — neither route may become an existence oracle.

Route inputs are strict and never accept an actor, source text, ownership or
mode. Failures are answered with the plugin's FIXED ``{code, message}``
categories — never a raw provider text, prompt or key.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError

from indramesh.sdk import (
    CoreDataError,
    TranslationScopeRequest,
    authorize_translation_scope,
    check_record_permission,
    require_permission,
)

from . import admission, generation, planning, runs, suggestions
from .models import SYSTEMUI_TYPE
from .schemas import (
    ApplyResult,
    AvailabilityOnly,
    AvailabilityResult,
    FieldGenerateRequest,
    OpenCountResult,
    RunStatus,
    SchemaCandidateCount,
    SchemaCandidatesResult,
    SchemaSuggestionView,
    SchemaSuggestionsResult,
    SuggestionApplyRequest,
    SuggestionView,
    UiApplyRequest,
    UiApplyResult,
    UiAvailabilityResult,
    UiCandidateView,
    UiCandidatesResult,
    UiSuggestionView,
    UiSuggestionsResult,
)

_DATA_DEPENDENCY = Depends(require_permission("ai-translation", "data"))
_UI_DEPENDENCY = Depends(require_permission("ai-translation", "ui"))
# A UI Apply/Discard additionally needs a FRESH Core update right. Suggestion
# discard never demands a new ``translations:delete`` right (D-15).
_UI_WRITE_DEPENDENCY = Depends(require_permission("translations", "update"))
# The safe run-status projection additionally requires the translation read right
# and (for a schema run) the schema read right; it never exposes a task log.
_RUNS_DEPENDENCIES = [
    Depends(require_permission("ai-translation", "data")),
    Depends(require_permission("translations", "read")),
    Depends(require_permission("schemas", "read")),
]

_INPUT_REJECTED = {
    "code": "input_rejected",
    "message": "Use a valid translation scope and review payload.",
}

# A record-level DENY on the schema is answered in the plugin's own fixed
# category (403 through ``_ERROR_STATUS``) — never a count, a run projection or
# a run-specific 404, and never the schema id echoed back.
_NOT_AUTHORIZED = {
    "code": "not_authorized",
    "message": "Not authorized for this schema.",
}

# The schema-less UI scope has no entity id; a fixed nil UUID keeps the same
# open-count helper applicable.
_NIL_UUID = uuid.UUID(int=0)

# The schema review list shows at most this many open proposals at once.
SCHEMA_REVIEW_CAP = 100

_ERROR_STATUS = {
    "not_authorized": 403,
    "actor_unavailable": 403,
    "not_found": 404,
    "invalid_input": 422,
    "payload_too_large": 422,
}


def _view(row) -> SuggestionView:
    return SuggestionView(
        suggestion_id=row.id,
        translation_type=row.translation_type,
        entity_id=row.entity_id,
        field=row.field,
        language_code=row.language_code,
        proposed_text=row.proposed_text,
        source_text=row.source_text,
        status=row.status,
    )


def _parse_uuid(value: str):
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=422, detail=_INPUT_REJECTED) from None


def _ui_language(value: str) -> str:
    """Normalize a UI target language and reject the authored source language."""
    language = admission.normalize_language(value)
    if not language or language == "en":
        raise HTTPException(status_code=422, detail=_INPUT_REJECTED)
    return language


def _core_data_error(exc: CoreDataError) -> HTTPException:
    """Map a bounded SDK data failure to its fixed HTTP category (no raw text)."""
    return HTTPException(
        status_code=_ERROR_STATUS.get(exc.code, 400),
        detail={"code": exc.code, "message": exc.message},
    )


async def _authorize(ctx, translation_type: str, entity_id, action: str, user):
    """Resolve the caller's authority for one scope or answer a fixed error."""
    try:
        return await authorize_translation_scope(
            ctx,
            TranslationScopeRequest(
                translation_type=translation_type,
                entity_id=entity_id,
                action=action,
            ),
            user=user,
        )
    except CoreDataError as exc:
        raise HTTPException(
            status_code=_ERROR_STATUS.get(exc.code, 400),
            detail={"code": exc.code, "message": exc.message},
        ) from None


async def _read_json_object(request: Request) -> dict:
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail=_INPUT_REJECTED) from None
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail=_INPUT_REJECTED)
    return raw


def build_router(ctx) -> APIRouter:
    """Build the router closing over the mount-time plugin context."""
    router = APIRouter()

    @router.get(
        "/data/status",
        response_model=AvailabilityResult,
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_status(
        translation_type: str = Query(min_length=1, max_length=50),
        entity_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        parsed_entity = _parse_uuid(entity_id)
        await _authorize(ctx, translation_type, parsed_entity, "read", user)
        async with ctx.db() as session:
            count = await suggestions.open_count(
                session, translation_type=translation_type, entity_id=parsed_entity
            )
        return AvailabilityResult(
            available=ctx.llm.is_configured(), open_count=count
        )

    @router.get(
        "/data/availability",
        response_model=AvailabilityOnly,
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_availability():
        """Scope-free LLM availability for the schema surface (D-16).

        Returns only ``ctx.llm.is_configured()`` — never a provider probe, a
        model, a URL or a key — so the schema section can hide its generation
        controls fail-closed without a translation scope.
        """
        return AvailabilityOnly(available=ctx.llm.is_configured())

    @router.get(
        "/data/open-count",
        response_model=OpenCountResult,
        dependencies=_RUNS_DEPENDENCIES,
    )
    async def data_open_count(
        schema_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        """The schema-wide OPEN data-suggestion count (D-02 short overview).

        Requires ``ai-translation:data`` + ``translations:read`` + ``schemas:read``
        so only an actor authorized for this schema reads the count. The caller's
        RECORD-level ``read`` decision is resolved first (D-07): a DENY answers
        403 ``not_authorized`` and the count query never runs — a ``0`` would
        still disclose that the schema exists.
        """
        parsed_schema = _parse_uuid(schema_id)
        if not await check_record_permission(user, "schema", parsed_schema, "read"):
            raise HTTPException(status_code=403, detail=_NOT_AUTHORIZED)
        async with ctx.db() as session:
            count = await suggestions.open_count_for_schema(session, schema_id=parsed_schema)
        return OpenCountResult(open_count=count)

    @router.get(
        "/data/schema-candidates",
        response_model=SchemaCandidatesResult,
        dependencies=_RUNS_DEPENDENCIES,
    )
    async def data_schema_candidates(
        schema_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        """Missing translations per kind for the schema section (authorized only).

        Counts only entities the caller may read (each page row is authorized
        before it is counted) and how many of those pairs already wait for
        review; an unknown schema yields zero rows.
        """
        parsed_schema = _parse_uuid(schema_id)
        try:
            async with ctx.db() as session:
                open_pairs = await suggestions.open_pairs_for_schema(
                    session, schema_id=parsed_schema
                )
            counts = await planning.count_schema_candidates(
                ctx, parsed_schema, open_pairs=open_pairs, user=user
            )
        except CoreDataError as exc:
            raise _core_data_error(exc) from None
        return SchemaCandidatesResult(
            items=[
                SchemaCandidateCount(
                    translation_type=kind,
                    missing=counts[kind]["missing"],
                    waiting=counts[kind]["waiting"],
                )
                for kind in planning.SCHEMA_TRANSLATION_TYPES
            ]
        )

    @router.get(
        "/data/schema-suggestions",
        response_model=SchemaSuggestionsResult,
        dependencies=_RUNS_DEPENDENCIES,
    )
    async def data_schema_suggestions(
        schema_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        """The schema's open data proposals for review in the schema section.

        Every row is authorized like the per-entity reload (translation read
        right, mapped entity right, deny-wins record cascade); a denied or
        vanished entity is left out, never disclosed.
        """
        parsed_schema = _parse_uuid(schema_id)
        async with ctx.db() as session:
            rows = await suggestions.open_suggestions_for_schema(
                session, schema_id=parsed_schema, limit=SCHEMA_REVIEW_CAP + 1
            )
        has_more = len(rows) > SCHEMA_REVIEW_CAP
        scopes = {}
        items = []
        for row in rows[:SCHEMA_REVIEW_CAP]:
            key = (row.translation_type, row.entity_id)
            if key not in scopes:
                try:
                    scopes[key] = await authorize_translation_scope(
                        ctx,
                        TranslationScopeRequest(
                            translation_type=row.translation_type,
                            entity_id=row.entity_id,
                            action="read",
                        ),
                        user=user,
                    )
                except CoreDataError:
                    scopes[key] = None
            scope = scopes[key]
            if scope is None or scope.schema_id != parsed_schema:
                continue
            owners = {owner.entity_type: owner.record_id for owner in scope.record_owners}
            items.append(
                SchemaSuggestionView(
                    suggestion_id=row.id,
                    translation_type=row.translation_type,
                    entity_id=row.entity_id,
                    field=row.field,
                    language_code=row.language_code,
                    proposed_text=row.proposed_text,
                    source_text=row.source_text,
                    can_update=scope.can_update,
                    object_id=owners.get("object"),
                    object_type_id=owners.get("object_type"),
                )
            )
        return SchemaSuggestionsResult(items=items, has_more=has_more)

    @router.post(
        "/data/generate",
        response_model=list[SuggestionView],
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_generate(
        request: Request,
        user=Depends(require_permission("ai-translation", "data")),
    ):
        raw = await _read_json_object(request)
        try:
            body = FieldGenerateRequest.model_validate(raw)
        except ValidationError:
            raise HTTPException(status_code=422, detail=_INPUT_REJECTED) from None

        scope = await _authorize(
            ctx, body.translation_type, body.entity_id, "read", user
        )
        try:
            async with ctx.db() as session:
                async with admission.field_operation(
                    session,
                    schema_id=scope.schema_id,
                    translation_type=scope.translation_type,
                    entity_id=scope.entity_id,
                ):
                    proposals = await generation.generate_field(ctx, scope)
                    if proposals:
                        await suggestions.persist_proposals(
                            session,
                            translation_type=scope.translation_type,
                            entity_id=scope.entity_id,
                            schema_id=scope.schema_id,
                            creator_id=getattr(user, "id", None),
                            proposals=proposals,
                        )
                    rows = await suggestions.open_suggestions(
                        session,
                        translation_type=scope.translation_type,
                        entity_id=scope.entity_id,
                    )
        except admission.AdmissionConflict as conflict:
            raise HTTPException(
                status_code=409,
                detail={"code": "already_running", "message": str(conflict)},
            ) from None
        except generation.GenerationFailure as failure:
            raise HTTPException(
                status_code=failure.status_code,
                detail={"code": failure.code, "message": failure.message},
            ) from None
        return [_view(row) for row in rows]

    @router.get(
        "/data/suggestions",
        response_model=list[SuggestionView],
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_suggestions(
        translation_type: str = Query(min_length=1, max_length=50),
        entity_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        parsed_entity = _parse_uuid(entity_id)
        await _authorize(ctx, translation_type, parsed_entity, "read", user)
        async with ctx.db() as session:
            rows = await suggestions.open_suggestions(
                session, translation_type=translation_type, entity_id=parsed_entity
            )
        return [_view(row) for row in rows]

    @router.post(
        "/data/apply",
        response_model=ApplyResult,
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_apply(
        request: Request,
        translation_type: str = Query(min_length=1, max_length=50),
        entity_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        parsed_entity = _parse_uuid(entity_id)
        # Saving requires fresh Core update authority, never the read right alone.
        scope = await _authorize(
            ctx, translation_type, parsed_entity, "update", user
        )
        raw = await _read_json_object(request)
        try:
            body = SuggestionApplyRequest.model_validate(raw)
        except ValidationError:
            raise HTTPException(status_code=422, detail=_INPUT_REJECTED) from None

        async with ctx.db() as session:
            return await suggestions.apply_data_suggestions(
                ctx, session, scope=scope, items=body.items, user=user
            )

    @router.delete(
        "/data/suggestions/{suggestion_id}",
        dependencies=[_DATA_DEPENDENCY],
    )
    async def data_discard(
        suggestion_id: str,
        translation_type: str = Query(min_length=1, max_length=50),
        entity_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        parsed_entity = _parse_uuid(entity_id)
        parsed_suggestion = _parse_uuid(suggestion_id)
        # Discard requires update authority (D-15); never a new Delete right.
        scope = await _authorize(
            ctx, translation_type, parsed_entity, "update", user
        )
        async with ctx.db() as session:
            discarded = await suggestions.discard_data_suggestion(
                session, suggestion_id=parsed_suggestion, scope=scope
            )
        if not discarded:
            raise HTTPException(
                status_code=404,
                detail={"code": "not_found", "message": "Suggestion not found."},
            )
        return {"discarded": True}

    @router.get(
        "/ui/status",
        response_model=UiAvailabilityResult,
        dependencies=[_UI_DEPENDENCY],
    )
    async def ui_status(user=Depends(require_permission("ai-translation", "ui"))):
        async with ctx.db() as session:
            count = await suggestions.open_count(
                session, translation_type=SYSTEMUI_TYPE, entity_id=_NIL_UUID
            )
        return UiAvailabilityResult(
            available=ctx.llm.is_configured(), open_count=count
        )

    @router.get(
        "/data/runs",
        response_model=RunStatus,
        dependencies=_RUNS_DEPENDENCIES,
    )
    async def data_runs(
        schema_id: str = Query(min_length=1, max_length=64),
        user=Depends(require_permission("ai-translation", "data")),
    ):
        """The safe run-status projection for one schema.

        The caller's RECORD-level ``read`` decision is resolved BEFORE the run
        lookup (D-07): a record DENY answers 403 ``not_authorized`` whether or
        not a run row exists, so the run-specific 404 below can never tell a
        denied caller that a run exists.
        """
        parsed_schema = _parse_uuid(schema_id)
        if not await check_record_permission(user, "schema", parsed_schema, "read"):
            raise HTTPException(status_code=403, detail=_NOT_AUTHORIZED)
        async with ctx.db() as session:
            run = await runs.latest_for_schema(session, parsed_schema)
            if run is None:
                raise HTTPException(
                    status_code=404,
                    detail={"code": "not_found", "message": "No translation run found."},
                )
            core_status = await runs.core_task_status(session, run.task_id)
            outcome = runs.projected_outcome(run, core_status)
            return RunStatus(
                task_id=run.task_id,
                kind=run.kind,
                schema_id=run.schema_id,
                target_language=run.target_language,
                outcome=outcome,
                attempted=run.attempted,
                generated=run.generated,
                skipped=run.skipped,
                failed=run.failed,
                started_at=run.started_at,
                finished_at=run.finished_at,
            )

    # --- UI candidate / review surface (D-03/D-06/D-08) -----------------------

    @router.get(
        "/ui/candidates",
        response_model=UiCandidatesResult,
        dependencies=[_UI_DEPENDENCY],
    )
    async def ui_candidates(
        target_language: str = Query(min_length=2, max_length=10),
        namespace: str | None = Query(default=None, max_length=255),
        namespace_is_null: bool = Query(default=False),
        q: str | None = Query(default=None, max_length=255),
        # ``only_missing`` is accepted for filter-shape parity only; the
        # selection already excludes every non-missing key, so it never changes
        # the block (D-06).
        only_missing: bool = Query(default=False),
        user=Depends(require_permission("ai-translation", "ui")),
    ):
        language = _ui_language(target_language)
        try:
            async with ctx.db() as session:
                block = await planning.plan_ui_candidates(
                    ctx,
                    session,
                    target_language=language,
                    namespace=namespace,
                    namespace_is_null=namespace_is_null,
                    q=q,
                    user=user,
                )
        except CoreDataError as exc:
            raise _core_data_error(exc) from None
        return UiCandidatesResult(
            items=[
                UiCandidateView(
                    ui_string_id=candidate.ui_string_id,
                    key=candidate.key,
                    namespace=candidate.namespace,
                    default_text=candidate.default_text,
                )
                for candidate in block["items"]
            ],
            eligible_total=block["eligible_total"],
            missing_total=block["missing_total"],
            has_more=block["has_more"],
        )

    @router.get(
        "/ui/runs",
        response_model=RunStatus,
        dependencies=[_UI_DEPENDENCY, Depends(require_permission("translations", "read"))],
    )
    async def ui_runs(
        target_language: str = Query(min_length=2, max_length=10),
        user=Depends(require_permission("ai-translation", "ui")),
    ):
        language = _ui_language(target_language)
        async with ctx.db() as session:
            run = await runs.latest_for_language(session, language)
            if run is None:
                raise HTTPException(
                    status_code=404,
                    detail={"code": "not_found", "message": "No translation run found."},
                )
            core_status = await runs.core_task_status(session, run.task_id)
            outcome = runs.projected_outcome(run, core_status)
            return RunStatus(
                task_id=run.task_id,
                kind=run.kind,
                schema_id=run.schema_id,
                target_language=run.target_language,
                outcome=outcome,
                attempted=run.attempted,
                generated=run.generated,
                skipped=run.skipped,
                failed=run.failed,
                started_at=run.started_at,
                finished_at=run.finished_at,
            )

    @router.get(
        "/ui/suggestions",
        response_model=UiSuggestionsResult,
        dependencies=[_UI_DEPENDENCY],
    )
    async def ui_suggestions(
        target_language: str = Query(min_length=2, max_length=10),
        namespace: str | None = Query(default=None, max_length=255),
        namespace_is_null: bool = Query(default=False),
        q: str | None = Query(default=None, max_length=255),
        user=Depends(require_permission("ai-translation", "ui")),
    ):
        language = _ui_language(target_language)
        try:
            async with ctx.db() as session:
                rows, total = await suggestions.list_ui_suggestions(
                    ctx,
                    session,
                    language_code=language,
                    namespace=namespace,
                    namespace_is_null=namespace_is_null,
                    q=q,
                    user=user,
                )
        except CoreDataError as exc:
            raise _core_data_error(exc) from None
        return UiSuggestionsResult(
            items=[
                UiSuggestionView(
                    suggestion_id=row.suggestion_id,
                    key=row.key,
                    namespace=row.namespace,
                    proposed_text=row.proposed_text,
                    source_text=row.source_text,
                    status=row.status,
                )
                for row in rows
            ],
            total=total,
        )

    @router.post(
        "/ui/apply",
        response_model=UiApplyResult,
        dependencies=[_UI_DEPENDENCY, _UI_WRITE_DEPENDENCY],
    )
    async def ui_apply(
        request: Request,
        user=Depends(require_permission("ai-translation", "ui")),
    ):
        """Commit exactly the displayed block with fresh safety/write authority."""
        raw = await _read_json_object(request)
        try:
            body = UiApplyRequest.model_validate(raw)
        except ValidationError:
            raise HTTPException(status_code=422, detail=_INPUT_REJECTED) from None
        language = _ui_language(body.target_language)
        try:
            async with ctx.db() as session:
                return await suggestions.apply_ui_block(
                    ctx,
                    session,
                    language_code=language,
                    namespace=body.namespace,
                    namespace_is_null=body.namespace_is_null,
                    q=body.q,
                    items=body.items,
                    user=user,
                )
        except suggestions.UiWriteFailed:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "transaction_failed",
                    "message": "The displayed block could not be committed; nothing was written.",
                },
            ) from None
        except suggestions.UiWriteUncertain:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "outcome_unknown",
                    "message": (
                        "The commit outcome is unknown; refetch suggestions and the "
                        "catalogue before another apply."
                    ),
                },
            ) from None
        except CoreDataError as exc:
            raise _core_data_error(exc) from None

    @router.delete(
        "/ui/suggestions/{suggestion_id}",
        dependencies=[_UI_DEPENDENCY, _UI_WRITE_DEPENDENCY],
    )
    async def ui_discard(
        suggestion_id: str,
        target_language: str = Query(min_length=2, max_length=10),
        namespace: str | None = Query(default=None, max_length=255),
        namespace_is_null: bool = Query(default=False),
        q: str | None = Query(default=None, max_length=255),
        user=Depends(require_permission("ai-translation", "ui")),
    ):
        """Commit a durable UI key/language tombstone for one owned proposal."""
        language = _ui_language(target_language)
        parsed_suggestion = _parse_uuid(suggestion_id)
        try:
            async with ctx.db() as session:
                discarded = await suggestions.discard_ui_suggestion(
                    ctx,
                    session,
                    suggestion_id=parsed_suggestion,
                    language_code=language,
                    namespace=namespace,
                    namespace_is_null=namespace_is_null,
                    q=q,
                    user=user,
                )
        except CoreDataError as exc:
            raise _core_data_error(exc) from None
        if not discarded:
            raise HTTPException(
                status_code=404,
                detail={"code": "not_found", "message": "Suggestion not found."},
            )
        return {"discarded": True}

    return router
