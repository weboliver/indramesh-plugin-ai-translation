"""The two generic ai-translation bulk runners (307-03, AITR-02).

Both are the declared ``run`` callables of the plugin's hidden Task types. They
use ONLY the existing Core worker lifecycle: ``ctx.report_step`` /
``ctx.report_progress`` / ``ctx.logger`` / ``ctx.set_outcome`` plus the persisted
``ctx.task`` projection. They never write a Core Task status and never import a
Core ORM model.

Honesty contract (D-09/D-10/D-11):

* a schema item is ONE entity (with its missing target-language pairs together);
  a UI item is exactly ONE UI-string key;
* each entity's/text's proposals are committed before the next provider call and
  the run counters advance in the same transaction;
* an isolated invalid response counts as ``failed`` and the run continues;
  a systemic provider failure stops the run (``provider_stop``) and raises a
  fixed safe ``PluginTaskError``; a total all-failed run raises too;
* ``CancelledError`` propagates, the ``finally`` persists a safe ``cancelled``
  summary with the real counters, and every committed proposal survives.
"""

import asyncio

from indramesh.sdk import PluginTaskError

from . import admission, planning, runs, suggestions
from .models import (
    KIND_SCHEMA,
    KIND_UI,
    OUTCOME_CANCELLED,
    OUTCOME_FAILED,
    OUTCOME_FINISHED,
    OUTCOME_PARTIAL,
    OUTCOME_PROVIDER_STOP,
)

_RUN_LOCK_WAIT_SECONDS = 5.0
_RUN_LOCK_POLL_SECONDS = 0.1


async def _acquire_run_lock(lock_factory, *, message: str):
    """Take a run lock within a short bounded wait, or fail with ``already_running``.

    A predecessor that is still unwinding (a cancelled run releasing its lock)
    is awaited briefly instead of overlapping.
    """
    loop = asyncio.get_event_loop()
    deadline = loop.time() + _RUN_LOCK_WAIT_SECONDS
    while True:
        ctx_manager = lock_factory()
        acquired = await ctx_manager.__aenter__()
        if acquired:
            return ctx_manager
        await ctx_manager.__aexit__(None, None, None)
        if loop.time() >= deadline:
            raise PluginTaskError(message)
        await asyncio.sleep(_RUN_LOCK_POLL_SECONDS)


async def _safe_finish(session, run_id, *, outcome, attempted, generated, skipped, failed):
    try:
        await runs.finish(
            session,
            run_id,
            outcome=outcome,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
    except Exception:  # noqa: BLE001 - a summary write must never mask the cause
        try:
            await session.rollback()
        except Exception:
            pass


async def _commit_counters(session, run_id, attempted, generated, skipped, failed):
    """Persist the honest run counters in the SAME transaction as the commit."""
    await runs.update_counters(
        session,
        run_id,
        attempted=attempted,
        generated=generated,
        skipped=skipped,
        failed=failed,
    )
    await session.commit()


def _raise_if_cancelled() -> None:
    """A cooperative cancellation checkpoint between provider calls and commits.

    ``with_cancel_monitor`` cancels the awaited job; checking here makes the stop
    deterministic even when a cancel arrives during a synchronous stretch between
    two awaited calls. An already-cancelled unit is deliberately NOT counted as
    attempted, so the terminal counters stay honest.
    """
    current = asyncio.current_task()
    if current is not None and current.cancelling():
        raise asyncio.CancelledError()


async def run_schema_bulk(ctx, task_id, **params):
    """The ``ai-translation.schema-bulk`` runner."""
    schema_id = getattr(ctx.task, "schema_id", None)
    if schema_id is None:
        raise PluginTaskError("A schema translation run requires a schema scope.")

    raw_types = params.get("translation_types")
    translation_types = planning.normalize_translation_types(raw_types)
    if raw_types is not None and not translation_types:
        raise PluginTaskError(
            "A schema translation run needs at least one translation kind."
        )

    async with ctx.db() as session:
        lock = await _acquire_run_lock(
            lambda: admission.schema_run_lock(session, schema_id),
            message="A translation run is already active for this schema.",
        )
        try:
            await _run_schema(
                ctx, session, task_id, schema_id, translation_types=translation_types
            )
        finally:
            await lock.__aexit__(None, None, None)
    return {"ok": True}


async def _run_schema(ctx, session, task_id, schema_id, *, translation_types=None):
    run_id = await runs.begin(
        session, task_id=task_id, kind=KIND_SCHEMA, schema_id=schema_id
    )
    creator_id = getattr(ctx.task, "creator_id", None)
    attempted = generated = skipped = failed = 0
    try:
        await ctx.report_step("plan")
        await ctx.report_progress(processed_objects=0, total_objects=None, force=True)
        await ctx.report_step("translate")

        async for projection, targets in planning.iter_schema_entities(
            ctx, schema_id, translation_types=translation_types
        ):
            _raise_if_cancelled()
            open_pairs = await suggestions.open_pair_set(
                session,
                translation_type=projection.translation_type,
                entity_id=projection.entity_id,
            )
            pending = [
                target
                for target in targets
                if (target.field, target.language_code) not in open_pairs
            ]
            if not pending:
                attempted += 1
                skipped += 1
                await _commit_counters(
                    session, run_id, attempted, generated, skipped, failed
                )
                await ctx.report_progress(processed_objects=attempted, total_objects=None)
                continue

            try:
                proposals, failure = await planning.generate_entity(ctx, pending)
            except planning.ProviderStop as stop:
                await _safe_finish(
                    session,
                    run_id,
                    outcome=OUTCOME_PROVIDER_STOP,
                    attempted=attempted,
                    generated=generated,
                    skipped=skipped,
                    failed=failed,
                )
                ctx.logger.warning(
                    "ai-translation schema run: provider stop reason=%s "
                    "attempted=%d generated=%d",
                    getattr(stop, "code", "unexpected"),
                    attempted,
                    generated,
                )
                raise PluginTaskError(str(stop)) from None

            attempted += 1
            if failure is not None:
                failed += 1
                ctx.logger.warning(
                    "ai-translation schema run: isolated unit failure reason=%s "
                    "attempted=%d failed=%d",
                    failure,
                    attempted,
                    failed,
                )
            elif proposals:
                await suggestions.persist_proposals(
                    session,
                    translation_type=projection.translation_type,
                    entity_id=projection.entity_id,
                    schema_id=schema_id,
                    creator_id=creator_id,
                    proposals=proposals,
                    task_id=task_id,
                    commit=False,
                )
                generated += 1
            else:
                skipped += 1
            await _commit_counters(
                session, run_id, attempted, generated, skipped, failed
            )
            await ctx.report_progress(processed_objects=attempted, total_objects=None)

        await ctx.report_step("finish")

        if attempted > 0 and generated == 0 and skipped == 0 and failed == attempted:
            await _safe_finish(
                session,
                run_id,
                outcome=OUTCOME_FAILED,
                attempted=attempted,
                generated=generated,
                skipped=skipped,
                failed=failed,
            )
            raise PluginTaskError(
                "The translation run could not generate any suggestion."
            )

        outcome = OUTCOME_FINISHED if failed == 0 else OUTCOME_PARTIAL
        await runs.finish(
            session,
            run_id,
            outcome=outcome,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
        ctx.logger.info(
            "ai-translation schema run: finished outcome=%s attempted=%d "
            "generated=%d skipped=%d failed=%d",
            outcome,
            attempted,
            generated,
            skipped,
            failed,
        )
        await ctx.report_progress(
            processed_objects=attempted, total_objects=attempted, force=True
        )
        if failed:
            ctx.set_outcome("PARTIAL_SUCCESS")
    except asyncio.CancelledError:
        await _safe_finish(
            session,
            run_id,
            outcome=OUTCOME_CANCELLED,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
        ctx.logger.warning(
            "ai-translation schema run: cancelled attempted=%d generated=%d "
            "skipped=%d failed=%d",
            attempted,
            generated,
            skipped,
            failed,
        )
        raise


async def run_ui_bulk(ctx, task_id, **params):
    """The ``ai-translation.ui-bulk`` runner."""
    language = admission.normalize_language(params.get("target_language"))
    if not language or language == "en":
        raise PluginTaskError(
            "A UI translation run requires a valid non-source target language."
        )
    namespace = params.get("namespace")
    namespace_is_null = bool(params.get("namespace_is_null"))
    q = params.get("q")

    async with ctx.db() as session:
        lock = await _acquire_run_lock(
            lambda: admission.ui_run_lock(session, language),
            message="A UI translation run is already active for this language.",
        )
        try:
            await _run_ui(
                ctx,
                session,
                task_id,
                language,
                namespace,
                namespace_is_null,
                q,
            )
        finally:
            await lock.__aexit__(None, None, None)
    return {"ok": True}


async def _run_ui(ctx, session, task_id, language, namespace, namespace_is_null, q):
    run_id = await runs.begin(
        session,
        task_id=task_id,
        kind=KIND_UI,
        target_language=language,
        filter={
            "namespace": namespace,
            "namespace_is_null": namespace_is_null,
            "q": q,
        },
    )
    creator_id = getattr(ctx.task, "creator_id", None)
    attempted = generated = skipped = failed = 0
    try:
        await ctx.report_step("plan")
        block = await planning.plan_ui_candidates(
            ctx,
            session,
            target_language=language,
            namespace=namespace,
            namespace_is_null=namespace_is_null,
            q=q,
        )
        items = block["items"]
        total = len(items)
        await ctx.report_progress(processed_objects=0, total_objects=total, force=True)
        await ctx.report_step("translate")

        for start in range(0, total, planning.UI_CHUNK_SIZE):
            _raise_if_cancelled()
            chunk = items[start : start + planning.UI_CHUNK_SIZE]
            try:
                accepted, failure = await planning.generate_ui_chunk(
                    ctx, chunk, language
                )
            except planning.ProviderStop as stop:
                await _safe_finish(
                    session,
                    run_id,
                    outcome=OUTCOME_PROVIDER_STOP,
                    attempted=attempted,
                    generated=generated,
                    skipped=skipped,
                    failed=failed,
                )
                ctx.logger.warning(
                    "ai-translation ui run: provider stop reason=%s "
                    "attempted=%d generated=%d",
                    getattr(stop, "code", "unexpected"),
                    attempted,
                    generated,
                )
                raise PluginTaskError(str(stop)) from None

            if failure is not None:
                attempted += len(chunk)
                failed += len(chunk)
                ctx.logger.warning(
                    "ai-translation ui run: isolated chunk failure reason=%s "
                    "attempted=%d failed=%d",
                    failure,
                    attempted,
                    failed,
                )
            else:
                rows = [
                    (candidate.ui_string_id, accepted[candidate.key])
                    for candidate in chunk
                    if candidate.key in accepted
                ]
                if rows:
                    await suggestions.persist_ui_proposals(
                        session,
                        language_code=language,
                        rows=rows,
                        creator_id=creator_id,
                        task_id=task_id,
                        commit=False,
                    )
                for candidate in chunk:
                    attempted += 1
                    if candidate.key in accepted:
                        generated += 1
                    else:
                        skipped += 1
            await _commit_counters(
                session, run_id, attempted, generated, skipped, failed
            )
            await ctx.report_progress(processed_objects=attempted, total_objects=total)

        await ctx.report_step("finish")

        if attempted > 0 and generated == 0 and skipped == 0 and failed == attempted:
            await _safe_finish(
                session,
                run_id,
                outcome=OUTCOME_FAILED,
                attempted=attempted,
                generated=generated,
                skipped=skipped,
                failed=failed,
            )
            raise PluginTaskError(
                "The translation run could not generate any suggestion."
            )

        outcome = OUTCOME_FINISHED if failed == 0 else OUTCOME_PARTIAL
        await runs.finish(
            session,
            run_id,
            outcome=outcome,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
        ctx.logger.info(
            "ai-translation ui run: finished outcome=%s attempted=%d "
            "generated=%d skipped=%d failed=%d",
            outcome,
            attempted,
            generated,
            skipped,
            failed,
        )
        await ctx.report_progress(
            processed_objects=attempted, total_objects=attempted, force=True
        )
        if failed:
            ctx.set_outcome("PARTIAL_SUCCESS")
    except asyncio.CancelledError:
        await _safe_finish(
            session,
            run_id,
            outcome=OUTCOME_CANCELLED,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
        ctx.logger.warning(
            "ai-translation ui run: cancelled attempted=%d generated=%d "
            "skipped=%d failed=%d",
            attempted,
            generated,
            skipped,
            failed,
        )
        raise
