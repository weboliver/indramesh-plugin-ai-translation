"""The ai-translation plugin's PRIVATE declarative model (Phase 307, Carry-05).

A plugin-owned ``MetaData`` with exactly ONE table, ``plugin_ai_translation_suggestions``.
It never reuses the Core table name and never alters a Core table (D-11=A): the
Core suggestion table is dropped by a Core revision in a later plan.

Imports only third-party SQLAlchemy — a plugin imports no ``app.*`` module (the
AST gate in ``tests/test_plugin_discovery.py`` enforces this).

Identity and lifecycle (D-12/D-16, T-307-06):

* The natural identity is ``(translation_type, entity_id, field, language_code)``
  — NOT a task/run id. Task/creator/schema are provenance only.
* A partial unique index over that identity ``WHERE status = 'pending'`` keeps at
  most ONE open proposal per natural pair across field and bulk sources; an
  insert of a second open proposal is a no-op (retain-open), never a replace.
* A second partial unique index over the same identity
  ``WHERE status = 'dismissed' AND translation_type = 'systemui'`` preserves the
  durable UI dismissal tombstone (D-12): a dismissed UI key/language stays
  excluded from re-selection. A data dismissal is re-requestable (D-12), so it
  carries no such guard.
"""

import datetime
import uuid

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    JSON,
    String,
    Text,
    text as sa_text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Plugin-owned lifecycle statuses (never a Core enum import).
STATUS_PENDING = "pending"
STATUS_APPLIED = "applied"
STATUS_SUPERSEDED = "superseded"
STATUS_DISMISSED = "dismissed"

STATUS_VALUES = (
    STATUS_PENDING,
    STATUS_APPLIED,
    STATUS_SUPERSEDED,
    STATUS_DISMISSED,
)

# The schema-less UI translation scope noun (mirrors the Core SDK's ``systemui``).
SYSTEMUI_TYPE = "systemui"

# The two plugin task families (declared in ``module.py``).
SCHEMA_BULK_TASK_TYPE = "ai-translation.schema-bulk"
UI_BULK_TASK_TYPE = "ai-translation.ui-bulk"

# Private run-summary outcomes (D-09/D-10/D-11). Never a Core Task status: Core
# alone writes the terminal Task row; this is the plugin's own honest summary of
# what the run actually did.
OUTCOME_RUNNING = "running"
OUTCOME_FINISHED = "finished"
OUTCOME_PARTIAL = "partial"
OUTCOME_PROVIDER_STOP = "provider_stop"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_FAILED = "failed"

OUTCOME_VALUES = (
    OUTCOME_RUNNING,
    OUTCOME_FINISHED,
    OUTCOME_PARTIAL,
    OUTCOME_PROVIDER_STOP,
    OUTCOME_CANCELLED,
    OUTCOME_FAILED,
)

# The run family (schema vs UI).
KIND_SCHEMA = "schema"
KIND_UI = "ui"


class Base(DeclarativeBase):
    """The plugin's private declarative base (own MetaData, own table prefix)."""


class TranslationSuggestion(Base):
    """One private AI translation proposal for a field/language identity."""

    __tablename__ = "plugin_ai_translation_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    translation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    proposed_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provenance only — never part of the natural identity.
    schema_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    creator_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=STATUS_PENDING
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
    )

    __table_args__ = (
        # Exactly one OPEN proposal per natural identity (D-12/D-16).
        Index(
            "uq_ai_translation_suggestions_pending",
            "translation_type",
            "entity_id",
            "field",
            "language_code",
            unique=True,
            postgresql_where=sa_text("status = 'pending'"),
        ),
        # Durable UI dismissal tombstone (D-12): one dismissed UI key/language.
        Index(
            "uq_ai_translation_suggestions_dismissed_ui",
            "translation_type",
            "entity_id",
            "field",
            "language_code",
            unique=True,
            postgresql_where=sa_text(
                "status = 'dismissed' AND translation_type = 'systemui'"
            ),
        ),
        Index(
            "ix_ai_translation_suggestions_entity",
            "translation_type",
            "entity_id",
        ),
    )


class Run(Base):
    """One private run summary: counters/outcome only, never proposal text (D-09).

    One row per Task (``task_id`` unique). It stores IDs and entity/text counters
    plus a safe outcome; all proposed text stays in
    ``plugin_ai_translation_suggestions``. Core alone writes the terminal Task
    status — this table is the plugin's honest, reloadable summary of what the
    run actually attempted.
    """

    __tablename__ = "plugin_ai_translation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), nullable=False, unique=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    schema_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )
    target_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # The UI filter (namespace/namespace_is_null/q) as a small JSON object.
    filter: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    attempted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    outcome: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OUTCOME_RUNNING
    )
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_ai_translation_runs_schema", "schema_id"),
        Index("ix_ai_translation_runs_language", "target_language"),
    )
