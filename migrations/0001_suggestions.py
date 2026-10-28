"""0001_suggestions — the ai-translation plugin's private suggestion table.

Phase 307 (AITR-03, Carry-05, T-307-09): the plugin owns its OWN Alembic chain
and writes exactly one table, ``plugin_ai_translation_suggestions``. It never
alters a Core table; the Core suggestion table is dropped by a separate Core
revision in a later plan. The natural-key partial unique guards and the durable
UI-dismissal tombstone guard mirror the plugin's declarative ``MetaData`` so the
ORM model and the migrated schema cannot drift apart.

Revision ID: 0001_suggestions
Revises:
Create Date: 2026-10-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_suggestions"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plugin_ai_translation_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("translation_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(length=50), nullable=False),
        sa.Column("language_code", sa.String(length=10), nullable=False),
        sa.Column("proposed_text", sa.Text(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column("schema_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("creator_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_plugin_ai_translation_suggestions"),
    )
    op.create_index(
        "uq_ai_translation_suggestions_pending",
        "plugin_ai_translation_suggestions",
        ["translation_type", "entity_id", "field", "language_code"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "uq_ai_translation_suggestions_dismissed_ui",
        "plugin_ai_translation_suggestions",
        ["translation_type", "entity_id", "field", "language_code"],
        unique=True,
        postgresql_where=sa.text(
            "status = 'dismissed' AND translation_type = 'systemui'"
        ),
    )
    op.create_index(
        "ix_ai_translation_suggestions_entity",
        "plugin_ai_translation_suggestions",
        ["translation_type", "entity_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ai_translation_suggestions_entity",
        table_name="plugin_ai_translation_suggestions",
    )
    op.drop_index(
        "uq_ai_translation_suggestions_dismissed_ui",
        table_name="plugin_ai_translation_suggestions",
    )
    op.drop_index(
        "uq_ai_translation_suggestions_pending",
        table_name="plugin_ai_translation_suggestions",
    )
    op.drop_table("plugin_ai_translation_suggestions")
