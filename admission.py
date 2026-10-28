"""Field-operation admission guards for the ai-translation plugin (307-02).

Two independent, multi-process safeguards (reusing the ``plugins/jira/admission``
primitives — never a Python lock or a process-local set):

* :func:`field_operation` is the FIELD-request guard. It runs a SHORT admission
  transaction that takes the schema admission xact lock, refuses the start while
  a sibling schema-bulk task is pending/running, then — on a DEDICATED
  ``AsyncConnection`` (never a pooled ``AsyncSession`` across commits) — takes a
  SHARED schema run lock and an EXCLUSIVE entity lock before the admission
  transaction ends. The dedicated connection holds those session-level locks for
  the whole provider call and proposal commit and releases them in ``finally``,
  cancellation included; closing the connection is the final safety net, so no
  stale claim can outlive a crashed request.

* A schema-less entity (no schema id) takes only the entity lock.

A duplicate entity request conflicts regardless of the requested fields or
languages (D-07): the entity lock identity is the natural translation pair, never
a per-source/task id. The schema lock identity is the schema, so a running field
request blocks a schema bulk (Task 3 takes the exclusive run lock) and a running
schema bulk blocks every field request in the same schema.
"""

import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy import text

from indramesh.sdk import TaskAdmissionRejected

# The schema-bulk task type this guard overlaps with (declared in a later plan).
SCHEMA_BULK_TASK_TYPE = "ai-translation.schema-bulk"
# The UI-bulk task type (declared in module.py).
UI_BULK_TASK_TYPE = "ai-translation.ui-bulk"

# Admission serializes (short) admitting transactions; a held run lock must never
# block a new admission behind it, hence the separate try-variant locks.
_ADMISSION_LOCK_SQL = text("SELECT pg_advisory_xact_lock(hashtext(:key))")
_SCHEMA_SHARED_TRY_SQL = text("SELECT pg_try_advisory_lock_shared(hashtext(:key))")
_ENTITY_TRY_SQL = text("SELECT pg_try_advisory_lock(hashtext(:key))")
_UNLOCK_SQL = text("SELECT pg_advisory_unlock(hashtext(:key))")
_UNLOCK_SHARED_SQL = text("SELECT pg_advisory_unlock_shared(hashtext(:key))")

# A sibling UI bulk is pending/running for the SAME normalized language, ANY
# filter (D-08: a filter-scoped lock would be too weak because keys overlap).
# The stored parameter is lowercased for the comparison so a differently-cased
# spelling ("DE" vs "de") still resolves to the same normalized language.
_SIBLING_UI_SQL = text(
    "SELECT 1 FROM tasks WHERE tasktype = :tasktype "
    "AND current_status IN ('PENDING', 'RUNNING') "
    "AND NOT (is_permanent AND schedule_id IS NULL) "
    "AND lower(plugin_parameters->>'target_language') = :language "
    "LIMIT 1"
)

# A sibling schema bulk is pending/running for the same schema. A permanent,
# schedule-less row is a schedule TEMPLATE, never a run in flight.
_SIBLING_BULK_SQL = text(
    "SELECT 1 FROM tasks WHERE tasktype = :tasktype "
    "AND schema_id = CAST(:schema_id AS uuid) "
    "AND current_status IN ('PENDING', 'RUNNING') "
    "AND NOT (is_permanent AND schedule_id IS NULL) "
    "LIMIT 1"
)


class AdmissionConflict(Exception):
    """A bounded, safe field-admission refusal (mapped to 409 ``already_running``)."""


def admission_key(schema_id) -> str:
    return f"ai-translation:data:admit:{schema_id}"


def schema_run_key(schema_id) -> str:
    return f"ai-translation:data:run:{schema_id}"


def entity_key(translation_type: str, entity_id) -> str:
    return f"ai-translation:field:run:{translation_type}:{entity_id}"


def ui_admission_key(language: str) -> str:
    return f"ai-translation:ui:admit:{language}"


def ui_run_key(language: str) -> str:
    return f"ai-translation:ui:run:{language}"


def normalize_language(code) -> str:
    """The normalized UI target-language key shared by admission and the runner."""
    return str(code or "").strip().lower()


async def _probe_exclusive(session, key: str, message: str) -> None:
    """Take-then-release the EXCLUSIVE run lock; refuse when it is held.

    A still-unwinding predecessor (a field request holding the shared schema
    lock, or a cancelled bulk still releasing its exclusive run lock) yields the
    bounded refusal instead of a spuriously failed Task.
    """
    connection = await session.bind.connect()
    acquired = False
    try:
        result = await connection.execute(_ENTITY_TRY_SQL, {"key": key})
        acquired = bool(result.scalar())
        if not acquired:
            raise TaskAdmissionRejected(message)
    finally:
        if acquired:
            try:
                await connection.execute(_UNLOCK_SQL, {"key": key})
            except Exception:  # noqa: BLE001 - close() below still releases it
                pass
        await connection.close()


async def admit_schema(session, task_data) -> None:
    """The schema-bulk declaration's Core admission hook (D-07).

    Runs inside Core's pre-persistence admission transaction: takes the schema
    admission xact lock, refuses a pending/running same-schema bulk sibling, then
    probes the EXCLUSIVE schema run lock so any active field request (holding the
    shared lock) or still-unwinding schema run yields 409 — no Task row persisted.
    """
    schema_id = getattr(task_data, "schema_id", None)
    if schema_id is None:
        raise TaskAdmissionRejected("A schema translation run requires a schema scope.")
    await session.execute(_ADMISSION_LOCK_SQL, {"key": admission_key(schema_id)})
    if await _sibling_bulk(session, schema_id):
        raise TaskAdmissionRejected(
            "A schema translation run is already pending or running for this schema."
        )
    await _probe_exclusive(
        session,
        schema_run_key(schema_id),
        "A schema translation run is already running for this schema.",
    )


async def admit_ui(session, task_data) -> None:
    """The UI-bulk declaration's Core admission hook (D-08).

    Keyed to the NORMALIZED target language, independent of namespace/search: a
    second same-language run is refused even with a different filter. Different
    languages remain independent.
    """
    parameters = getattr(task_data, "plugin_parameters", None) or {}
    language = normalize_language(parameters.get("target_language"))
    if not language or language == "en":
        raise TaskAdmissionRejected(
            "A UI translation run requires a valid non-source target language."
        )
    await session.execute(_ADMISSION_LOCK_SQL, {"key": ui_admission_key(language)})
    sibling = (
        await session.execute(
            _SIBLING_UI_SQL,
            {"tasktype": UI_BULK_TASK_TYPE, "language": language},
        )
    ).first()
    if sibling is not None:
        raise TaskAdmissionRejected(
            "A UI translation run is already pending or running for this language."
        )
    await _probe_exclusive(
        session,
        ui_run_key(language),
        "A UI translation run is already running for this language.",
    )


@asynccontextmanager
async def schema_run_lock(session, schema_id) -> AsyncIterator[bool]:
    """Hold the EXCLUSIVE schema run-lifetime lock on a dedicated connection.

    Yields ``True`` when this run owns the schema (no field request and no other
    schema run is active) and ``False`` otherwise. Released on every exit path,
    cancellation included, on the same pinned connection.
    """
    key = schema_run_key(schema_id)
    connection = await session.bind.connect()
    acquired = False
    try:
        result = await connection.execute(_ENTITY_TRY_SQL, {"key": key})
        acquired = bool(result.scalar())
        yield acquired
    finally:
        if acquired:
            try:
                await connection.execute(_UNLOCK_SQL, {"key": key})
            except Exception:  # noqa: BLE001 - close() below still releases it
                pass
        await connection.close()


@asynccontextmanager
async def ui_run_lock(session, language: str) -> AsyncIterator[bool]:
    """Hold the EXCLUSIVE UI run-lifetime lock for one language (D-08)."""
    key = ui_run_key(normalize_language(language))
    connection = await session.bind.connect()
    acquired = False
    try:
        result = await connection.execute(_ENTITY_TRY_SQL, {"key": key})
        acquired = bool(result.scalar())
        yield acquired
    finally:
        if acquired:
            try:
                await connection.execute(_UNLOCK_SQL, {"key": key})
            except Exception:  # noqa: BLE001 - close() below still releases it
                pass
        await connection.close()


async def _sibling_bulk(connection, schema_id) -> bool:
    row = (
        await connection.execute(
            _SIBLING_BULK_SQL,
            {"tasktype": SCHEMA_BULK_TASK_TYPE, "schema_id": str(schema_id)},
        )
    ).first()
    return row is not None


@asynccontextmanager
async def field_operation(
    session, *, schema_id, translation_type: str, entity_id: uuid.UUID
) -> AsyncIterator[None]:
    """Admit one field request or raise :class:`AdmissionConflict`.

    The short admission transaction (schema admission xact lock + sibling-bulk
    check + shared/exclusive run locks) commits BEFORE the caller's provider call
    runs, so no LLM I/O happens under the admission transaction. The dedicated
    connection keeps the session-level run locks for the whole caller block.
    """
    engine = session.bind
    connection = await engine.connect()
    schema_locked = False
    entity_locked = False
    try:
        try:
            async with connection.begin():
                if schema_id is not None:
                    await connection.execute(
                        _ADMISSION_LOCK_SQL, {"key": admission_key(schema_id)}
                    )
                    if await _sibling_bulk(connection, schema_id):
                        raise AdmissionConflict(
                            "A schema translation run is already pending or "
                            "running for this schema."
                        )
                    shared = (
                        await connection.execute(
                            _SCHEMA_SHARED_TRY_SQL, {"key": schema_run_key(schema_id)}
                        )
                    ).scalar()
                    if not shared:
                        raise AdmissionConflict(
                            "A schema translation run is already running for "
                            "this schema."
                        )
                    schema_locked = True
                acquired = (
                    await connection.execute(
                        _ENTITY_TRY_SQL,
                        {"key": entity_key(translation_type, entity_id)},
                    )
                ).scalar()
                if not acquired:
                    raise AdmissionConflict(
                        "A translation request for this entity is already running."
                    )
                entity_locked = True
        except AdmissionConflict:
            raise
        except Exception as exc:  # noqa: BLE001 - bounded, credential-free refusal
            raise AdmissionConflict(
                "The translation request could not be admitted."
            ) from None
        yield
    finally:
        if entity_locked:
            try:
                await connection.execute(
                    _UNLOCK_SQL,
                    {"key": entity_key(translation_type, entity_id)},
                )
            except Exception:  # noqa: BLE001 - close() below still releases it
                pass
        if schema_locked:
            try:
                await connection.execute(
                    _UNLOCK_SHARED_SQL, {"key": schema_run_key(schema_id)}
                )
            except Exception:  # noqa: BLE001 - close() below still releases it
                pass
        await connection.close()
