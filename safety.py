"""Exact UI text-shape safety and full-token placeholder validation (307-03).

Ported verbatim from the retired Core ``ui_translation_suggest_service``
(Carry-06 / D-16): the technical gate is *value-shaped*, never a product-name
blacklist, so ordinary sentences that merely mention a product name stay
translatable while pure placeholders, whitespace-free structural identifiers,
ALL-CAPS acronyms and pure numbers are excluded. Placeholder safety is exact
FULL-TOKEN set equality, never a token count or a normalized name.

Only third-party imports — a plugin imports no ``app.*`` module.
"""

import re

# A whole value that is nothing but one ``{{token}}``.
_TOKEN_ONLY_RE = re.compile(r"^\{\{[^{}]+\}\}$")
# Identifier-safe characters for the technical-shape gate.
_IDENTIFIER_CHARS_RE = re.compile(r"^[A-Za-z0-9_.:/\-]+$")
# "." is deliberately excluded from the separator set: it is a legitimate
# identifier-path character but also the trailing ellipsis of ordinary copy.
_IDENTIFIER_SEPARATOR_RE = re.compile(r"[_:/\-]")
# The exact full-token pattern (set equality is the gate).
_PLACEHOLDER_TOKEN_RE = re.compile(r"\{\{[^{}]+\}\}")

# The proposed-value ceiling (mirrors the Core PlainStr(5000) bound).
UI_MAX_TEXT = 5000


def extract_placeholder_tokens(text: str | None) -> frozenset[str]:
    """The exact set of ``{{token}}`` placeholders in ``text`` (D-16)."""
    return frozenset(_PLACEHOLDER_TOKEN_RE.findall(text or ""))


def is_technical_ui_string(key: str, default_text: str) -> bool:
    """True when ``default_text`` is value-shaped technical content (D-16).

    A pure ``{{token}}``; or a whitespace-free identifier-safe string that is a
    structured identifier/path/URL (contains ``_``/``:``/``/``/``-``), a bare
    ALL-CAPS acronym, or purely numeric. Plain one-word copy ("Save") and
    ordinary sentences stay translatable. ``key`` is kept for interface
    stability even though it is unused (no key-namespace blacklist).
    """
    trimmed = (default_text or "").strip()
    if not trimmed:
        return False
    if _TOKEN_ONLY_RE.match(trimmed):
        return True
    if re.search(r"\s", trimmed):
        return False
    if not _IDENTIFIER_CHARS_RE.match(trimmed):
        return False
    if _IDENTIFIER_SEPARATOR_RE.search(trimmed):
        return True
    if trimmed.isupper() and len(trimmed) > 1:
        return True
    if trimmed.isdigit():
        return True
    return False


def validate_ui_suggestion(
    key: str,
    default_text: str,
    proposed_text: str | None,
    requested_keys: set[str],
) -> str | None:
    """The exact safety gates (D-16/D-17). ``None`` means the proposal is valid.

    Deterministic order: scope -> presence -> length -> technical -> placeholder
    set equality. Reasons are the fixed English backend codes
    ``out_of_scope``/``empty``/``too_long``/``technical_key``/
    ``placeholder_mismatch`` (frontend maps them to localized copy).
    """
    if key not in requested_keys:
        return "out_of_scope"
    if not proposed_text or not proposed_text.strip():
        return "empty"
    if len(proposed_text) > UI_MAX_TEXT:
        return "too_long"
    if is_technical_ui_string(key, default_text):
        return "technical_key"
    if extract_placeholder_tokens(default_text) != extract_placeholder_tokens(
        proposed_text
    ):
        return "placeholder_mismatch"
    return None
