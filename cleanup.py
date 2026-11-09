"""Cleanup of this plugin's private rows when a language disappears (D-19).

The plugin owns two private tables keyed by a language code:

* ``plugin_ai_translation_suggestions.language_code`` — every status, including
  the durable UI dismissal tombstones;
* ``plugin_ai_translation_runs.target_language`` — nullable, because a schema
  run carries no target language.

Core never touches these tables. It announces a deleted language through the
generic ``on_language_deleted`` hook, and this module removes the plugin's own
rows. A newly created language with the same code therefore starts without old
proposals or old dismissals.

Both functions compare case-insensitively: UI rows are written with
``admission.normalize_language`` (lowercased) while pre-normalisation codes may
still carry uppercase letters.

Only SQLAlchemy and this package's own models are imported here — a plugin must
never import an ``app.*`` module (the AST gate in
``tests/test_plugin_discovery.py`` enforces it).
"""

import sqlalchemy as sa
from sqlalchemy import delete, func

from .models import Run, TranslationSuggestion


def _normalize(code) -> str:
    """The comparable form of a language code (never a wildcard)."""
    return str(code or "").strip().lower()


async def purge_language(session, code) -> int:
    """Delete every suggestion and run row of one language code, then commit.

    Returns the number of removed rows (suggestions + runs). A blank code is a
    no-op — a missing value must never turn into a delete-everything statement.
    """
    normalized = _normalize(code)
    if not normalized:
        return 0

    suggestions = await session.execute(
        delete(TranslationSuggestion).where(
            func.lower(TranslationSuggestion.language_code) == normalized
        )
    )
    runs = await session.execute(
        delete(Run).where(
            Run.target_language.is_not(None),
            func.lower(Run.target_language) == normalized,
        )
    )
    await session.commit()
    return (suggestions.rowcount or 0) + (runs.rowcount or 0)


async def purge_unknown_languages(session) -> int:
    """Delete suggestions/runs whose language no longer exists, then commit.

    This is the reconciliation pass run on plugin load: it catches the cases the
    hook cannot (plugin inactive at delete time, hook failed, a running job wrote
    its summary afterwards). It can never prevent the plugin from loading — the
    caller bounds and wraps it.

    The surviving codes are read through a bare ``languages`` table description
    (``sa.table``), so no Core module is imported. Two safety rules
    (T-323.1-30):

    * an EMPTY code set aborts without deleting — an empty read must never be
      treated as "everything is unknown";
    * ``Run.target_language IS NULL`` (a schema run) is never a match.
    """
    languages = sa.table("languages", sa.column("code"))
    rows = await session.execute(sa.select(languages.c.code))
    known = {
        _normalize(code) for code in rows.scalars().all() if code is not None
    }
    if not known:
        return 0

    suggestions = await session.execute(
        delete(TranslationSuggestion).where(
            func.lower(TranslationSuggestion.language_code).notin_(known)
        )
    )
    runs = await session.execute(
        delete(Run).where(
            Run.target_language.is_not(None),
            func.lower(Run.target_language).notin_(known),
        )
    )
    await session.commit()
    return (suggestions.rowcount or 0) + (runs.rowcount or 0)
