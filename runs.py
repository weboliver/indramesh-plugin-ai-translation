"""Private run-summary persistence and the safe status projection (307-03).

One row per plugin bulk Task (``task_id`` unique) holding IDs, entity/text
counters and a safe outcome — never proposal text. Core alone writes the
terminal Task status; the status projection here reports Core's truth for a
private row still marked ``running`` so a stale private state can never override
a terminal Core outcome (D-09).
"""

import datetime
import uuid

from sqlalchemy import select, text, update

from .models import (
    OUTCOME_RUNNING,
    OUTCOME_VALUES,
    Run,
)

# Core's own terminal task statuses (read-only projection, never written here).
_TERMINAL_CORE_STATUSES = frozenset({"SUCCESS", "PARTIAL_SUCCESS", "FAILED", "DEAD_LETTER"})

# Core Task status -> the plugin outcome the projection reports for a stale row.
_CORE_TO_OUTCOME = {
    "SUCCESS": "finished",
    "PARTIAL_SUCCESS": "partial",
    "FAILED": "failed",
    "DEAD_LETTER": "failed",
}


async def begin(
    session,
    *,
    task_id: uuid.UUID,
    kind: str,
    schema_id=None,
    target_language: str | None = None,
    filter: dict | None = None,
) -> uuid.UUID:
    """Start (or restart) the one run row of a Task.

    An ARQ retry re-runs the SAME Task row, so an existing row is reset to a
    fresh ``running`` baseline rather than duplicated.
    """
    row = (
        await session.execute(select(Run).where(Run.task_id == task_id))
    ).scalar_one_or_none()
    if row is None:
        row = Run(
            id=uuid.uuid4(),
            task_id=task_id,
            kind=kind,
            schema_id=schema_id,
            target_language=target_language,
            filter=filter,
            outcome=OUTCOME_RUNNING,
        )
        session.add(row)
    else:
        row.kind = kind
        row.schema_id = schema_id
        row.target_language = target_language
        row.filter = filter
        row.outcome = OUTCOME_RUNNING
        row.attempted = 0
        row.generated = 0
        row.skipped = 0
        row.failed = 0
        row.started_at = datetime.datetime.now(datetime.timezone.utc)
        row.finished_at = None
    await session.commit()
    return row.id


async def update_counters(
    session,
    run_id: uuid.UUID,
    *,
    attempted: int,
    generated: int,
    skipped: int,
    failed: int,
) -> None:
    """Update the honest counters of one run (same transaction as its commit)."""
    await session.execute(
        update(Run)
        .where(Run.id == run_id)
        .values(
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
        )
    )


async def finish(
    session,
    run_id: uuid.UUID,
    *,
    outcome: str,
    attempted: int,
    generated: int,
    skipped: int,
    failed: int,
) -> None:
    """Persist the terminal run summary (counters + safe outcome + finish time)."""
    if outcome not in OUTCOME_VALUES:
        outcome = "failed"
    await session.execute(
        update(Run)
        .where(Run.id == run_id)
        .values(
            outcome=outcome,
            attempted=attempted,
            generated=generated,
            skipped=skipped,
            failed=failed,
            finished_at=datetime.datetime.now(datetime.timezone.utc),
        )
    )
    await session.commit()


async def latest_for_schema(session, schema_id):
    """The most recent run row for one schema, or ``None``."""
    return (
        await session.execute(
            select(Run)
            .where(Run.schema_id == schema_id)
            .order_by(Run.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def latest_for_language(session, language_code):
    """The most recent UI run row for one normalized language, or ``None``."""
    return (
        await session.execute(
            select(Run)
            .where(Run.target_language == language_code)
            .order_by(Run.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def core_task_status(session, task_id) -> str | None:
    """The persisted Core Task status for one id (read-only raw projection)."""
    return (
        await session.execute(
            text("SELECT current_status FROM tasks WHERE id = CAST(:t AS uuid)"),
            {"t": str(task_id)},
        )
    ).scalar_one_or_none()


def projected_outcome(run, core_status: str | None) -> str:
    """The honest outcome for a run row, preferring Core's terminal truth.

    A private ``running`` row whose Core Task already reached a terminal status
    is reported with the Core outcome — a stale private state never overrides a
    terminal Core outcome (D-09).
    """
    if run.outcome == OUTCOME_RUNNING and core_status in _TERMINAL_CORE_STATUSES:
        return _CORE_TO_OUTCOME[core_status]
    return run.outcome
