"""0002_runs — the ai-translation plugin's private run-summary table.

Phase 307 (AITR-02, D-09/D-10/D-11): one row per plugin bulk Task holding only
IDs and entity/text counters plus a safe outcome. It is never a second proposal
store — all proposed text stays in ``plugin_ai_translation_suggestions`` — and it
never alters a Core table. Core alone writes the terminal Task status.

Revision ID: 0002_runs
Revises: 0001_suggestions
Create Date: 2026-10-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_runs"
down_revision: Union[str, None] = "0001_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plugin_ai_translation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("schema_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_language", sa.String(length=10), nullable=True),
        sa.Column("filter", sa.JSON(), nullable=True),
        sa.Column("attempted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("generated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "outcome", sa.String(length=20), nullable=False, server_default="running"
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_plugin_ai_translation_runs"),
        sa.UniqueConstraint("task_id", name="uq_plugin_ai_translation_runs_task"),
    )
    op.create_index(
        "ix_ai_translation_runs_schema",
        "plugin_ai_translation_runs",
        ["schema_id"],
    )
    op.create_index(
        "ix_ai_translation_runs_language",
        "plugin_ai_translation_runs",
        ["target_language"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ai_translation_runs_language", table_name="plugin_ai_translation_runs"
    )
    op.drop_index(
        "ix_ai_translation_runs_schema", table_name="plugin_ai_translation_runs"
    )
    op.drop_table("plugin_ai_translation_runs")
