"""Private suggestion persistence, review commit and discard (Phase 307-02).

Everything here works on the plugin's OWN table through the Core-provided
session (``ctx.db()``); no Core ORM import, no Core table write except the
explicit, freshly-authorized SDK translation commit (D-01/D-04/D-12).

* :func:`persist_proposals` inserts only genuinely missing pairs and NEVER
  replaces an existing open proposal — ``ON CONFLICT DO NOTHING`` keeps the
  natural-key retain-open policy (D-12, T-307-06).
* :func:`apply_data_suggestions` commits reviewed drafts through
  ``write_translations`` in ``fill_missing`` mode, so a target that was filled
  between generation and review is skipped, never overwritten (D-04), and then
  reconciles the private lifecycle.
* :func:`discard_data_suggestion` marks a data proposal dismissed; a later
  re-request may propose it again (D-12).
"""

import dataclasses
import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from indramesh.sdk import (
    CoreDataError,
    TranslationBatchWrite,
    TranslationWrite,
    UiTranslationBatchWrite,
    UiTranslationCatalogRequest,
    UiTranslationWrite,
    read_ui_translation_catalog,
    write_translations,
    write_ui_translations,
)

from . import safety
from .models import (
    STATUS_APPLIED,
    STATUS_DISMISSED,
    STATUS_PENDING,
    STATUS_SUPERSEDED,
    SYSTEMUI_TYPE,
    TranslationSuggestion,
)
from .schemas import ApplyItemResult, ApplyResult, UiApplyItemResult, UiApplyResult

# The UI review block cap (D-03): the review route returns at most 100 rows.
UI_REVIEW_CAP = 100

# The SDK codes that are a fresh-authority refusal, not a transaction failure.
_AUTH_CODES = frozenset({"not_authorized", "actor_unavailable"})


class UiWriteFailed(Exception):
    """A CONFIRMED atomic UI write failure: nothing was committed (D-04).

    The SDK batch commits at most once, so a typed failure means this block
    wrote nothing. The outcome is known, so a caller may retry deliberately.
    """

    code = "transaction_failed"


class UiWriteUncertain(Exception):
    """An UNRECEIVED/unknown UI write outcome (the write MAY have committed).

    A transport interruption never proves the block was written or not; the
    caller must refetch suggestions and catalogue before another uncertain
    apply. Never automatically replayed (D-04).
    """

    code = "outcome_unknown"


async def persist_proposals(
    session,
    *,
    translation_type: str,
    entity_id: uuid.UUID,
    schema_id: Optional[uuid.UUID],
    creator_id: Optional[uuid.UUID],
    proposals,
    task_id: Optional[uuid.UUID] = None,
    commit: bool = True,
) -> int:
    """Insert only missing proposals; never replace an open one (D-12).

    Returns the number of rows actually inserted. A proposal whose natural
    identity already has an OPEN row (or a dismissed UI tombstone) is silently
    skipped by ``ON CONFLICT DO NOTHING``. ``commit=False`` lets a bulk runner
    update its run counters in the SAME transaction as the proposals.
    """
    inserted = 0
    for proposal in proposals:
        statement = (
            pg_insert(TranslationSuggestion)
            .values(
                id=uuid.uuid4(),
                translation_type=translation_type,
                entity_id=entity_id,
                field=proposal.field,
                language_code=proposal.language_code,
                proposed_text=proposal.text,
                source_text=proposal.source_text,
                schema_id=schema_id,
                creator_id=creator_id,
                task_id=task_id,
                status=STATUS_PENDING,
            )
            .on_conflict_do_nothing()
        )
        result = await session.execute(statement)
        inserted += result.rowcount or 0
    if commit:
        await session.commit()
    return inserted


async def persist_ui_proposals(
    session,
    *,
    language_code: str,
    rows,
    creator_id: Optional[uuid.UUID],
    task_id: Optional[uuid.UUID] = None,
    commit: bool = True,
) -> int:
    """Insert many UI proposals (one per key) in one transaction (D-12).

    ``rows`` is an iterable of ``(ui_string_id, AcceptedProposal)``. Retain-open
    identity applies exactly as for data proposals; a dismissed UI tombstone is
    preserved, never resurrected.
    """
    inserted = 0
    for ui_string_id, proposal in rows:
        statement = (
            pg_insert(TranslationSuggestion)
            .values(
                id=uuid.uuid4(),
                translation_type=SYSTEMUI_TYPE,
                entity_id=ui_string_id,
                field="value",
                language_code=language_code,
                proposed_text=proposal.text,
                source_text=proposal.source_text,
                schema_id=None,
                creator_id=creator_id,
                task_id=task_id,
                status=STATUS_PENDING,
            )
            .on_conflict_do_nothing()
        )
        result = await session.execute(statement)
        inserted += result.rowcount or 0
    if commit:
        await session.commit()
    return inserted


async def open_pair_set(
    session, *, translation_type: str, entity_id: uuid.UUID
) -> set[tuple[str, str]]:
    """The ``(field, language_code)`` pairs with an OPEN proposal for one entity."""
    rows = (
        await session.execute(
            select(
                TranslationSuggestion.field, TranslationSuggestion.language_code
            ).where(
                TranslationSuggestion.translation_type == translation_type,
                TranslationSuggestion.entity_id == entity_id,
                TranslationSuggestion.status == STATUS_PENDING,
            )
        )
    ).all()
    return {(field, language_code) for field, language_code in rows}


async def open_suggestions(
    session, *, translation_type: str, entity_id: uuid.UUID
) -> list[TranslationSuggestion]:
    """Every OPEN proposal for one entity identity (ordered deterministically)."""
    rows = (
        await session.execute(
            select(TranslationSuggestion)
            .where(
                TranslationSuggestion.translation_type == translation_type,
                TranslationSuggestion.entity_id == entity_id,
                TranslationSuggestion.status == STATUS_PENDING,
            )
            .order_by(TranslationSuggestion.field, TranslationSuggestion.language_code)
        )
    ).scalars().all()
    return list(rows)


async def open_count(session, *, translation_type: str, entity_id: uuid.UUID) -> int:
    """The number of OPEN proposals for one entity identity."""
    rows = await open_suggestions(
        session, translation_type=translation_type, entity_id=entity_id
    )
    return len(rows)


async def open_count_for_schema(session, *, schema_id: uuid.UUID) -> int:
    """The number of OPEN data proposals for one schema (D-02 short overview).

    The schema section's open-suggestion line is the plugin's own short result
    overview: it counts this schema's still-open data proposals (never a
    schema-less ``systemui`` key). The route that serves it requires
    ``schemas:read`` + ``translations:read`` + ``ai-translation:data``, so the
    count is only ever read by an actor authorized for this schema.
    """
    rows = (
        await session.execute(
            select(TranslationSuggestion.id).where(
                TranslationSuggestion.schema_id == schema_id,
                TranslationSuggestion.status == STATUS_PENDING,
                TranslationSuggestion.translation_type != SYSTEMUI_TYPE,
            )
        )
    ).scalars().all()
    return len(rows)


async def open_pairs_for_schema(session, *, schema_id: uuid.UUID) -> set[tuple]:
    """The ``(translation_type, entity_id, field, language_code)`` open pairs.

    Same filters as :func:`open_count_for_schema`: this schema's still-open data
    proposals, never a schema-less ``systemui`` key. The caller matches these
    against pairs of entities it already read through the authorized SDK page.
    """
    rows = (
        await session.execute(
            select(
                TranslationSuggestion.translation_type,
                TranslationSuggestion.entity_id,
                TranslationSuggestion.field,
                TranslationSuggestion.language_code,
            ).where(
                TranslationSuggestion.schema_id == schema_id,
                TranslationSuggestion.status == STATUS_PENDING,
                TranslationSuggestion.translation_type != SYSTEMUI_TYPE,
            )
        )
    ).all()
    return {
        (translation_type, entity_id, field, language_code)
        for translation_type, entity_id, field, language_code in rows
    }


async def open_suggestions_for_schema(
    session, *, schema_id: uuid.UUID, limit: int
) -> list[TranslationSuggestion]:
    """This schema's OPEN data proposals, oldest first, at most ``limit`` rows."""
    rows = (
        await session.execute(
            select(TranslationSuggestion)
            .where(
                TranslationSuggestion.schema_id == schema_id,
                TranslationSuggestion.status == STATUS_PENDING,
                TranslationSuggestion.translation_type != SYSTEMUI_TYPE,
            )
            .order_by(TranslationSuggestion.created_at, TranslationSuggestion.id)
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)


def reconciled_status(*, written: bool, reason: Optional[str]) -> str:
    """The private lifecycle status for one SDK write outcome (D-04).

    A written entry becomes ``applied``; a target that was filled between
    generation and review (``existing_translation``) becomes ``superseded`` and is
    never overwritten; any other skip leaves the proposal open (``pending``) so a
    retry converges without replacing the stored value.
    """
    if written:
        return STATUS_APPLIED
    if reason == "existing_translation":
        return STATUS_SUPERSEDED
    return STATUS_PENDING


async def _load_owned_pending(
    session, suggestion_id: uuid.UUID, *, translation_type: str, entity_id: uuid.UUID
) -> Optional[TranslationSuggestion]:
    """Load a pending proposal ONLY if it belongs to the resolved scope identity.

    A foreign or already-resolved id returns ``None`` so the caller reports a
    stable ``invalid`` outcome instead of ever disclosing another record (T-307-05).
    """
    return (
        await session.execute(
            select(TranslationSuggestion).where(
                TranslationSuggestion.id == suggestion_id,
                TranslationSuggestion.status == STATUS_PENDING,
                TranslationSuggestion.translation_type == translation_type,
                TranslationSuggestion.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()


async def apply_data_suggestions(
    ctx,
    session,
    *,
    scope,
    items,
    user,
) -> ApplyResult:
    """Commit reviewed drafts via ``fill_missing`` and reconcile the lifecycle.

    Every referenced identity is validated against the resolved scope BEFORE any
    Core call, so an unauthorized or foreign id fails per-item as ``invalid`` and
    never reaches ``write_translations`` (D-04/D-15, T-307-05).
    """
    results: list[ApplyItemResult] = []
    entries = []
    owners: list[TranslationSuggestion] = []
    for item in items:
        row = await _load_owned_pending(
            session,
            item.suggestion_id,
            translation_type=scope.translation_type,
            entity_id=scope.entity_id,
        )
        if row is None:
            results.append(
                ApplyItemResult(
                    suggestion_id=item.suggestion_id,
                    status="invalid",
                    reason="not_found",
                )
            )
            continue
        entries.append(
            TranslationWrite(
                translation_type=row.translation_type,
                entity_id=row.entity_id,
                field=row.field,
                language_code=row.language_code,
                value=item.value,
            )
        )
        owners.append(row)

    written = skipped = invalid = 0
    for result in results:
        invalid += 1

    if entries:
        batch = await write_translations(
            ctx, TranslationBatchWrite(mode="fill_missing", entries=entries), user=user
        )
        by_index = {entry.index: entry for entry in batch.results}
        for index, row in enumerate(owners):
            outcome = by_index.get(index)
            written_here = outcome is not None and outcome.written
            reason = (outcome.reason if outcome is not None else None) or "skipped"
            await _set_status(
                session,
                row.id,
                reconciled_status(written=written_here, reason=reason),
            )
            if written_here:
                results.append(
                    ApplyItemResult(suggestion_id=row.id, status="written")
                )
                written += 1
            else:
                results.append(
                    ApplyItemResult(
                        suggestion_id=row.id, status="skipped", reason=reason
                    )
                )
                skipped += 1
        await session.commit()

    return ApplyResult(
        written=written, skipped=skipped, invalid=invalid, results=results
    )


async def discard_data_suggestion(
    session, *, suggestion_id: uuid.UUID, scope
) -> bool:
    """Mark one owned data proposal dismissed (re-requestable). Returns success."""
    row = await _load_owned_pending(
        session,
        suggestion_id,
        translation_type=scope.translation_type,
        entity_id=scope.entity_id,
    )
    if row is None:
        return False
    await _set_status(session, row.id, STATUS_DISMISSED)
    await session.commit()
    return True


async def _set_status(session, suggestion_id: uuid.UUID, status: str) -> None:
    from sqlalchemy import func

    await session.execute(
        update(TranslationSuggestion)
        .where(TranslationSuggestion.id == suggestion_id)
        .values(status=status, updated_at=func.now())
    )


# --- UI (systemui) review surface ---------------------------------------------


@dataclasses.dataclass(frozen=True)
class UiReviewRow:
    """One OPEN UI proposal joined with its CURRENT authorized key metadata."""

    suggestion_id: uuid.UUID
    ui_string_id: uuid.UUID
    key: str
    namespace: Optional[str]
    proposed_text: str
    source_text: Optional[str]
    status: str


async def _authorized_catalog(
    ctx, *, language_code, namespace, namespace_is_null, q, user, ids=None
) -> dict:
    """Authorized ``ui_string_id -> (key, namespace, code_default, stored)``.

    Every page read authorizes ``translations:read`` through the SDK, so an
    unauthorized caller fails before any row is returned (D-15). When ``ids`` is
    given the traversal stops once every requested id is found, so a review/apply
    pays only for the rows it actually needs. ``stored`` is the CURRENT raw target
    value (``None``/blank when still missing) so a caller can reconcile a target
    filled between generation and review without a second read.
    """
    index: dict = {}
    wanted = set(ids) if ids is not None else None
    cursor = None
    while True:
        page = await read_ui_translation_catalog(
            ctx,
            UiTranslationCatalogRequest(
                editor_language=language_code,
                namespace=namespace,
                namespace_is_null=namespace_is_null,
                q=q,
                limit=200,
                after=cursor,
            ),
            user=user,
        )
        for item in page.items:
            if item.ui_string_id is None:
                continue
            index[item.ui_string_id] = (
                item.key,
                item.namespace,
                item.code_default or "",
                item.stored_value,
            )
        cursor = page.next_cursor
        if cursor is None:
            break
        if wanted is not None and wanted <= set(index):
            break
    return index


async def list_ui_suggestions(
    ctx,
    session,
    *,
    language_code: str,
    namespace: Optional[str],
    namespace_is_null: bool,
    q: Optional[str],
    user=None,
) -> tuple[list[UiReviewRow], int]:
    """The current review block rows plus the filter-wide open total (D-03).

    Rows are the caller's OPEN UI proposals whose key is STILL in the authorized
    catalogue for the current language+filter, ordered ``namespace``/``key`` and
    capped at 100; ``total`` is the filter-wide open count (never capped). A key
    that left the filter (or the catalogue) is silently dropped, never disclosed.
    """
    index = await _authorized_catalog(
        ctx,
        language_code=language_code,
        namespace=namespace,
        namespace_is_null=namespace_is_null,
        q=q,
        user=user,
    )
    if not index:
        return [], 0
    rows = (
        await session.execute(
            select(TranslationSuggestion).where(
                TranslationSuggestion.translation_type == SYSTEMUI_TYPE,
                TranslationSuggestion.field == "value",
                TranslationSuggestion.language_code == language_code,
                TranslationSuggestion.status == STATUS_PENDING,
                TranslationSuggestion.entity_id.in_(list(index)),
            )
        )
    ).scalars().all()
    decorated: list[UiReviewRow] = []
    reconciled: list[uuid.UUID] = []
    for row in rows:
        key, row_namespace, default_text, stored_value = index[row.entity_id]
        # Fresh-target reconciliation (D-04): a target filled after generation but
        # before the private status commit left this row pending. The next review
        # read converges it to ``superseded`` and drops it from the block — the
        # stored value is never overwritten and the row is never re-offered.
        if stored_value is not None and stored_value.strip():
            reconciled.append(row.id)
            continue
        decorated.append(
            UiReviewRow(
                suggestion_id=row.id,
                ui_string_id=row.entity_id,
                key=key,
                namespace=row_namespace,
                proposed_text=row.proposed_text,
                source_text=default_text or row.source_text,
                status=row.status,
            )
        )
    if reconciled:
        for suggestion_id in reconciled:
            await _set_status(session, suggestion_id, STATUS_SUPERSEDED)
        await session.commit()
    decorated.sort(key=lambda review: (review.namespace or "", review.key))
    return decorated[:UI_REVIEW_CAP], len(decorated)


async def apply_ui_block(
    ctx,
    session,
    *,
    language_code: str,
    namespace: Optional[str],
    namespace_is_null: bool,
    q: Optional[str],
    items,
    user,
) -> UiApplyResult:
    """Commit exactly the displayed UI block with fresh safety and write authority.

    Every referenced identity is resolved against the CURRENT authorized
    catalogue (current key + authored source) at write time, so a forged,
    cross-language or out-of-scope suggestion id fails per-row as ``invalid`` and
    never reaches the Core write (D-04/D-15, T-307-12). Only the valid subset is
    submitted ONCE through the strict ``fill_missing`` batch; an expected
    ``existing_translation`` skip is reported, never overwritten. The private
    status commit follows the SDK results.
    """
    ids = [item.suggestion_id for item in items]
    rows: dict = {}
    if ids:
        result = await session.execute(
            select(TranslationSuggestion).where(
                TranslationSuggestion.id.in_(ids),
                TranslationSuggestion.translation_type == SYSTEMUI_TYPE,
                TranslationSuggestion.field == "value",
                TranslationSuggestion.language_code == language_code,
                TranslationSuggestion.status == STATUS_PENDING,
            )
        )
        rows = {row.id: row for row in result.scalars().all()}

    wanted = {row.entity_id for row in rows.values()}
    index = await _authorized_catalog(
        ctx,
        language_code=language_code,
        namespace=namespace,
        namespace_is_null=namespace_is_null,
        q=q,
        user=user,
        ids=wanted,
    )

    results: list[UiApplyItemResult] = []
    resolved: list = []  # (row, key, default_text, value)
    requested_keys: set[str] = set()
    seen: set = set()
    for item in items:
        if item.suggestion_id in seen:
            results.append(
                UiApplyItemResult(
                    suggestion_id=item.suggestion_id, status="invalid", reason="duplicate"
                )
            )
            continue
        seen.add(item.suggestion_id)
        row = rows.get(item.suggestion_id)
        if row is None:
            results.append(
                UiApplyItemResult(
                    suggestion_id=item.suggestion_id, status="invalid", reason="not_found"
                )
            )
            continue
        catalog = index.get(row.entity_id)
        if catalog is None:
            results.append(
                UiApplyItemResult(
                    suggestion_id=item.suggestion_id,
                    status="invalid",
                    reason="out_of_scope",
                )
            )
            continue
        key, _namespace, default_text, _stored = catalog
        requested_keys.add(key)
        resolved.append((row, key, default_text, item.value))

    entries = []
    owners = []
    for row, key, default_text, value in resolved:
        reason = safety.validate_ui_suggestion(key, default_text, value, requested_keys)
        if reason is not None:
            results.append(
                UiApplyItemResult(
                    suggestion_id=row.id, status="invalid", reason=reason
                )
            )
            continue
        entries.append(
            UiTranslationWrite(
                ui_string_id=row.entity_id,
                language_code=language_code,
                value=value,
            )
        )
        owners.append(row)

    if entries:
        try:
            batch = await write_ui_translations(
                ctx,
                UiTranslationBatchWrite(mode="fill_missing", entries=entries),
                user=user,
            )
        except CoreDataError as exc:
            if exc.code in _AUTH_CODES:
                raise
            # The SDK batch is atomic: a typed failure wrote nothing (confirmed).
            raise UiWriteFailed() from None
        except Exception:  # noqa: BLE001 - an unreceived response is NOT a failure
            raise UiWriteUncertain() from None

        by_index = {entry_result.index: entry_result for entry_result in batch.results}
        for position, row in enumerate(owners):
            outcome = by_index.get(position)
            written_here = outcome is not None and outcome.written
            reason = (outcome.reason if outcome is not None else None) or "skipped"
            await _set_status(
                session,
                row.id,
                reconciled_status(written=written_here, reason=reason),
            )
            if written_here:
                results.append(
                    UiApplyItemResult(suggestion_id=row.id, status="written")
                )
            else:
                results.append(
                    UiApplyItemResult(
                        suggestion_id=row.id, status="skipped", reason=reason
                    )
                )
        await session.commit()

    written = sum(1 for r in results if r.status == "written")
    skipped = sum(1 for r in results if r.status == "skipped")
    invalid = sum(1 for r in results if r.status == "invalid")
    return UiApplyResult(
        written=written, skipped=skipped, invalid=invalid, results=results
    )


async def discard_ui_suggestion(
    ctx,
    session,
    *,
    suggestion_id: uuid.UUID,
    language_code: str,
    namespace: Optional[str],
    namespace_is_null: bool,
    q: Optional[str],
    user,
) -> bool:
    """Commit a durable UI key/language tombstone for one owned proposal (D-12).

    Only the key's own language is considered and the current authorized
    catalogue must still contain the row; the row is marked ``dismissed`` (never
    deleted), so the identity is excluded from future automated candidates while
    manual editing stays possible. Returns success.
    """
    row = (
        await session.execute(
            select(TranslationSuggestion).where(
                TranslationSuggestion.id == suggestion_id,
                TranslationSuggestion.translation_type == SYSTEMUI_TYPE,
                TranslationSuggestion.field == "value",
                TranslationSuggestion.language_code == language_code,
                TranslationSuggestion.status == STATUS_PENDING,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    index = await _authorized_catalog(
        ctx,
        language_code=language_code,
        namespace=namespace,
        namespace_is_null=namespace_is_null,
        q=q,
        user=user,
        ids={row.entity_id},
    )
    if row.entity_id not in index:
        return False
    await _set_status(session, row.id, STATUS_DISMISSED)
    await session.commit()
    return True
