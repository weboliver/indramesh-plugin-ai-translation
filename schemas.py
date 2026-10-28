"""Strict plugin-owned Pydantic DTOs for the ai-translation API (Phase 307).

Every model is ``extra="forbid"`` and every string/collection carries an explicit
upper bound. Route inputs are deliberately minimal: they NEVER accept an actor,
a source text, an ownership claim, a lifecycle ``status`` or a write ``mode`` —
the plugin resolves all of those from the Core SDK and its own private table, so
a client cannot smuggle authority through a request body (T-307-05/T-307-06).

The LLM response model (``FieldGenerationOutput``) is also strict: a malformed or
unknown proposal is a validation error, never a silently accepted write.
"""

from typing import List, Optional
from uuid import UUID

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_STRICT = ConfigDict(extra="forbid")

TRANSLATION_TYPE_MAX = 50
FIELD_MAX = 50
LANGUAGE_CODE_MIN = 2
LANGUAGE_CODE_MAX = 10
PROPOSED_TEXT_MAX = 5000
SOURCE_TEXT_MAX = 5000
MAX_PROPOSALS = 200
MAX_APPLY_ITEMS = 200
REASON_MAX = 50
UI_BLOCK_CAP = 100


class FieldGenerateRequest(BaseModel):
    """One field generation request: a single translation scope (D-01)."""

    model_config = _STRICT

    translation_type: str = Field(min_length=1, max_length=TRANSLATION_TYPE_MAX)
    entity_id: UUID


class SuggestionView(BaseModel):
    """One open private proposal the caller is authorized to review (D-01)."""

    model_config = _STRICT

    suggestion_id: UUID
    translation_type: str
    entity_id: UUID
    field: str
    language_code: str
    proposed_text: str
    source_text: Optional[str] = None
    status: str


class SchemaSuggestionView(BaseModel):
    """One open proposal on the schema review list, authorized for the caller.

    ``object_id``/``object_type_id`` are the record owners the host links to;
    ``can_update`` says whether Apply/Discard will be accepted.
    """

    model_config = _STRICT

    suggestion_id: UUID
    translation_type: str
    entity_id: UUID
    field: str
    language_code: str
    proposed_text: str
    source_text: Optional[str] = None
    can_update: bool
    object_id: Optional[UUID] = None
    object_type_id: Optional[UUID] = None


class SchemaSuggestionsResult(BaseModel):
    """The schema review list; ``has_more`` when more open proposals exist."""

    model_config = _STRICT

    items: List[SchemaSuggestionView] = Field(default_factory=list)
    has_more: bool


class SuggestionApplyItem(BaseModel):
    """One review decision: commit THIS proposal's value for its own identity."""

    model_config = _STRICT

    suggestion_id: UUID
    value: str = Field(min_length=1, max_length=PROPOSED_TEXT_MAX)


class SuggestionApplyRequest(BaseModel):
    """A batch of explicit per-field commit decisions (D-01/D-04)."""

    model_config = _STRICT

    items: List[SuggestionApplyItem] = Field(default_factory=list, max_length=MAX_APPLY_ITEMS)


class ApplyItemResult(BaseModel):
    """The stable per-item outcome of one explicit commit (no raw exception)."""

    model_config = _STRICT

    suggestion_id: UUID
    status: str  # written | skipped | invalid
    reason: Optional[str] = Field(default=None, max_length=REASON_MAX)


class ApplyResult(BaseModel):
    """The neutral result of one explicit review commit (D-04)."""

    model_config = _STRICT

    written: int
    skipped: int
    invalid: int
    results: List[ApplyItemResult] = Field(default_factory=list)


class AvailabilityResult(BaseModel):
    """Availability + open-proposal count for an authorized scope (D-16).

    ``available`` is ``ctx.llm.is_configured()`` only — never a provider probe.
    ``open_count`` is computed AFTER the caller's scope authority is resolved.
    """

    model_config = _STRICT

    available: bool
    open_count: int


class UiAvailabilityResult(BaseModel):
    """Availability + open-proposal count for the schema-less UI scope (D-16)."""

    model_config = _STRICT

    available: bool
    open_count: int


class AvailabilityOnly(BaseModel):
    """Scope-free LLM availability for the schema section's presence/start gate.

    Reads ``ctx.llm.is_configured()`` only (never a provider probe, D-16) so the
    schema surface can hide its generation controls fail-closed without a
    translation scope.
    """

    model_config = _STRICT

    available: bool


class OpenCountResult(BaseModel):
    """The schema-wide OPEN data-suggestion count (D-02 short result overview)."""

    model_config = _STRICT

    open_count: int


class SchemaCandidateCount(BaseModel):
    """Missing/waiting target pairs of one schema translation kind."""

    model_config = _STRICT

    translation_type: str
    missing: int
    waiting: int


class SchemaCandidatesResult(BaseModel):
    """The six per-kind counts of the schema section, in canonical kind order."""

    model_config = _STRICT

    items: List[SchemaCandidateCount] = Field(default_factory=list)


# --- LLM response shape (strict; validated through the requested model) -------


class FieldProposal(BaseModel):
    """One proposal the model returns for a requested (field, language) pair."""

    model_config = _STRICT

    field: str = Field(min_length=1, max_length=FIELD_MAX)
    language_code: str = Field(min_length=LANGUAGE_CODE_MIN, max_length=LANGUAGE_CODE_MAX)
    text: str = Field(min_length=1, max_length=PROPOSED_TEXT_MAX)


class FieldGenerationOutput(BaseModel):
    """The single structured completion shape the facade returns (D-10)."""

    model_config = _STRICT

    proposals: List[FieldProposal] = Field(default_factory=list, max_length=MAX_PROPOSALS)


# --- UI generation shape (strict) ---------------------------------------------


class UiProposal(BaseModel):
    """One proposal the model returns for a requested UI key."""

    model_config = _STRICT

    key: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=1, max_length=PROPOSED_TEXT_MAX)


class UiGenerationOutput(BaseModel):
    """The single structured UI completion shape the facade returns (D-10)."""

    model_config = _STRICT

    items: List[UiProposal] = Field(default_factory=list, max_length=MAX_PROPOSALS)


# --- run status projection (safe; IDs/counters/state only) --------------------


class RunStatus(BaseModel):
    """The safe run-summary projection (D-09/D-10/D-11).

    Carries only IDs, honest counters, times and a safe outcome. It NEVER
    exposes a task log, an error message or generic task access.
    """

    model_config = _STRICT

    task_id: UUID
    kind: str
    schema_id: Optional[UUID] = None
    target_language: Optional[str] = None
    outcome: str
    attempted: int
    generated: int
    skipped: int
    failed: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class UiCandidateView(BaseModel):
    """One eligible missing UI key the caller may review/generate (D-06)."""

    model_config = _STRICT

    ui_string_id: UUID
    key: str
    namespace: Optional[str] = None
    default_text: str


class UiCandidatesResult(BaseModel):
    """The bounded UI candidate block plus honest post-exclusion counts (D-06)."""

    model_config = _STRICT

    items: List[UiCandidateView] = Field(default_factory=list)
    eligible_total: int
    missing_total: int
    has_more: bool


class UiSuggestionView(BaseModel):
    """One open UI proposal the caller may review (D-03/D-15)."""

    model_config = _STRICT

    suggestion_id: UUID
    key: str
    namespace: Optional[str] = None
    proposed_text: str
    source_text: Optional[str] = None
    status: str


class UiSuggestionsResult(BaseModel):
    """The current review block rows plus the filter-wide open total (D-03)."""

    model_config = _STRICT

    items: List[UiSuggestionView] = Field(default_factory=list)
    total: int


class UiApplyItem(BaseModel):
    """One reviewed UI decision: commit THIS proposal's value for its key."""

    model_config = _STRICT

    suggestion_id: UUID
    value: str = Field(min_length=1, max_length=PROPOSED_TEXT_MAX)


class UiApplyRequest(BaseModel):
    """The explicit displayed-block commit request (D-03/D-04)."""

    model_config = _STRICT

    target_language: str = Field(min_length=2, max_length=LANGUAGE_CODE_MAX)
    namespace: Optional[str] = Field(default=None, max_length=255)
    namespace_is_null: bool = False
    q: Optional[str] = Field(default=None, max_length=255)
    items: List[UiApplyItem] = Field(default_factory=list, max_length=UI_BLOCK_CAP)


class UiApplyItemResult(BaseModel):
    """The stable per-row outcome of one displayed-block commit (D-04)."""

    model_config = _STRICT

    suggestion_id: UUID
    status: str  # written | skipped | invalid
    reason: Optional[str] = Field(default=None, max_length=REASON_MAX)


class UiApplyResult(BaseModel):
    """The neutral result of one explicit UI block commit (D-04)."""

    model_config = _STRICT

    written: int
    skipped: int
    invalid: int
    results: List[UiApplyItemResult] = Field(default_factory=list)
