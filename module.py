"""The ai-translation plugin module (Phase 307, AITR-01/AITR-02).

An ``ApiRoutesPlugin`` + ``TaskTypePlugin`` that mounts its own AI-translation
suggestion API under ``/api/v1/plugins/ai-translation``, exposes its OWN private
``MetaData`` (``plugin_ai_translation_*`` tables under a verified restricted
role) and declares the two hidden bulk Task types
(``ai-translation.schema-bulk`` / ``ai-translation.ui-bulk``).

Imports only the public ``indramesh.sdk`` surface — never an ``app.*`` module
(the AST gate in ``tests/test_plugin_discovery.py`` enforces this). The HTTP
surface lives in ``routes.py``; planning, generation, private persistence,
admission and the runners live in their own modules.
"""

import asyncio
from pathlib import Path

from indramesh.sdk import ApiRoutesPlugin, TaskTypeDeclaration, TaskTypePlugin

from . import admission, cleanup, planning, routes, tasks

# The schema bulk carries its scope in the real Core ``schema_id`` column. Its
# only start parameter is the optional kind selection; absent = all six kinds.
SCHEMA_TASK_PARAMETER_SCHEMA = {
    "type": "object",
    "properties": {
        "translation_types": {
            "type": "array",
            "items": {"enum": list(planning.SCHEMA_TRANSLATION_TYPES)},
            "minItems": 1,
            "maxItems": len(planning.SCHEMA_TRANSLATION_TYPES),
            "uniqueItems": True,
        }
    },
    "required": [],
    "additionalProperties": False,
}

# The UI bulk is filter-scoped: one target language plus an optional namespace /
# NULL-namespace / search filter. The contradiction guard rejects a namespace
# together with ``namespace_is_null``.
UI_TASK_PARAMETER_SCHEMA = {
    "type": "object",
    "properties": {
        "target_language": {"type": "string", "minLength": 2, "maxLength": 10},
        "namespace": {"type": ["string", "null"], "maxLength": 255},
        "namespace_is_null": {"type": "boolean"},
        "q": {"type": ["string", "null"], "maxLength": 255},
    },
    "required": ["target_language"],
    "additionalProperties": False,
    "allOf": [
        {
            "not": {
                "properties": {"namespace_is_null": {"const": True}},
                "required": ["namespace"],
            }
        }
    ],
}


def _load_database_metadata():
    """Load ``models.py``'s private ``MetaData`` (package-relative import).

    Returning ``None`` when the file is absent lets a copied plugin be
    neutralised (for example in tests) without editing Python; a present but
    broken ``models.py`` still fails loudly.
    """
    models_py = Path(__file__).with_name("models.py")
    if not models_py.is_file():
        return None

    from .models import Base

    return Base.metadata


class AiTranslationPlugin(ApiRoutesPlugin, TaskTypePlugin):
    """The directory-scanned ai-translation plugin (AITR-01/AITR-02)."""

    database_metadata = _load_database_metadata()

    def register_routes(self, ctx):
        # The router closes over the mount-time context so per-request access to
        # ``ctx.llm`` and ``ctx.db()`` uses the live provider-neutral Core facade.
        return routes.build_router(ctx)

    def task_types(self):
        """The two hidden bulk Task types (never the generic Create Task dialog).

        ``catalog_visible=False`` removes them from that ONE surface only — the
        task list, type filter, direct start and retry stay complete; the AI
        rights and the Core task permissions remain the real gates.
        """
        return [
            TaskTypeDeclaration(
                name="ai-translation.schema-bulk",
                run=tasks.run_schema_bulk,
                steps=("plan", "translate", "finish"),
                parameter_schema=SCHEMA_TASK_PARAMETER_SCHEMA,
                label="AI Schema Translation",
                schedulable=False,
                scope_requirements=("schema_id",),
                required_permission="ai-translation:data",
                admission_permissions=("translations:read", "schemas:read"),
                admit=admission.admit_schema,
                catalog_visible=False,
            ),
            TaskTypeDeclaration(
                name="ai-translation.ui-bulk",
                run=tasks.run_ui_bulk,
                steps=("plan", "translate", "finish"),
                parameter_schema=UI_TASK_PARAMETER_SCHEMA,
                label="AI UI Translation",
                schedulable=False,
                required_permission="ai-translation:ui",
                admission_permissions=("translations:read",),
                admit=admission.admit_ui,
                catalog_visible=False,
            ),
        ]

    async def on_load(self, ctx):
        """Activate the plugin, then reconcile rows for languages that are gone.

        The reconciliation is bounded and swallowed (T-323.1-31): Core's registry
        puts a plugin on ERROR when ``on_load`` raises or exceeds its 5 s limit,
        so a slow or failing cleanup must only log a warning — the plugin always
        stays loadable.
        """
        ctx.logger.info("ai-translation plugin loaded")
        try:
            async with ctx.db() as session:
                removed = await asyncio.wait_for(
                    cleanup.purge_unknown_languages(session), timeout=3
                )
        except Exception as exc:  # noqa: BLE001 - loading must never be blocked
            ctx.logger.warning(
                "ai-translation language reconciliation skipped: %s", exc
            )
        else:
            if removed:
                ctx.logger.info(
                    "ai-translation removed %s rows for unknown languages", removed
                )
        return None

    async def on_language_deleted(self, ctx, **kwargs):
        """Remove this plugin's rows for a deleted language (D-19).

        Core fires this AFTER the deleting transaction commits and passes no
        shared session, so ``ctx.db()`` opens a fresh one and this cleanup commits
        on its own. A failure is logged and swallowed: a cleanup must never turn
        a successful language delete into an error.
        """
        code = kwargs.get("language_code")
        try:
            async with ctx.db() as session:
                removed = await cleanup.purge_language(session, code)
        except Exception as exc:  # noqa: BLE001 - the hook must never gate
            ctx.logger.warning(
                "ai-translation cleanup for deleted language %r failed: %s",
                code,
                exc,
            )
            return None
        ctx.logger.info(
            "ai-translation removed %s rows for deleted language %r", removed, code
        )
        return None

    async def on_unload(self, ctx):
        ctx.logger.info("ai-translation plugin unloaded")
        return None

    async def health_check(self, ctx):
        return True
