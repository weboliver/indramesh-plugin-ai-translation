// Phase 307 (AITR-01/02/03): the pure, React-free logic for the ai-translation
// plugin's three contributions.
//
// Everything that can be decided without a browser lives here so
// `node --test translation-state.test.js` exercises the whole contract with
// injected host seams. The React components bind these controllers to the host
// `api`/`requestScope`/draft handlers; no provider or client singleton is ever
// created here.
//
// The plugin API routes are RELATIVE to the host `api` baseURL ('/api/v1/'): an
// absolute '/api/v1/plugins/...' path would double the prefix and 404.

export const PLUGIN_PREFIX = 'plugins/ai-translation'

// --- data (field/schema) surface ---------------------------------------------
export const PANEL_STATUS_PATH = `${PLUGIN_PREFIX}/data/status`
export const PANEL_SUGGESTIONS_PATH = `${PLUGIN_PREFIX}/data/suggestions`
export const PANEL_GENERATE_PATH = `${PLUGIN_PREFIX}/data/generate`
export const PANEL_APPLY_PATH = `${PLUGIN_PREFIX}/data/apply`
export const RUNS_PATH = `${PLUGIN_PREFIX}/data/runs`
export function dataDiscardPath(suggestionId) {
  return `${PLUGIN_PREFIX}/data/suggestions/${suggestionId}`
}

// --- UI (admin) surface -------------------------------------------------------
export const UI_STATUS_PATH = `${PLUGIN_PREFIX}/ui/status`
export const UI_CANDIDATES_PATH = `${PLUGIN_PREFIX}/ui/candidates`
export const UI_SUGGESTIONS_PATH = `${PLUGIN_PREFIX}/ui/suggestions`
export const UI_RUNS_PATH = `${PLUGIN_PREFIX}/ui/runs`
export const UI_APPLY_PATH = `${PLUGIN_PREFIX}/ui/apply`
export function uiDiscardPath(suggestionId) {
  return `${PLUGIN_PREFIX}/ui/suggestions/${suggestionId}`
}

// --- Core task start ----------------------------------------------------------
export const TASKS_PATH = '/tasks/'
export const SCHEMA_TASK_TYPE = 'ai-translation.schema-bulk'
export const UI_TASK_TYPE = 'ai-translation.ui-bulk'

// The client budget sits above the plugin's 50s cooperative server deadline so
// the bounded server answer is what the user sees.
export const GENERATE_TIMEOUT_MS = 55000
export const RUN_POLL_MS = 2000
// Five tolerated consecutive "no run" answers after a user start: the run row is
// created inside the worker (tasks.py `runs.begin()`), not by `POST /tasks`.
export const RUN_START_GRACE_POLLS = 5
export const UI_BLOCK_CAP = 100

// --- typed error categories (fixed, plugin-owned copy; never raw provider text)
export const ERROR_CODES = [
  'timeout',
  'unreachable',
  'rate_limited',
  'not_configured',
  'permission',
  'input_rejected',
  'invalid_result',
  'already_running',
  'conflict',
  'unexpected',
]

const RETRYABLE_CODES = new Set([
  'timeout',
  'unreachable',
  'rate_limited',
  'input_rejected',
  'invalid_result',
  'unexpected',
])

export function retryAllowed(code) {
  return RETRYABLE_CODES.has(code)
}

// Fixed English copy per category; the plugin catalogs translate each key. A
// missing catalog entry still renders fixed, safe text (never raw server text).
export const ERROR_COPY = {
  timeout: {
    titleKey: 'error.timeout.title',
    title: 'AI service unavailable',
    bodyKey: 'error.timeout.body',
    body: 'The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.',
  },
  unreachable: {
    titleKey: 'error.unreachable.title',
    title: 'AI service unavailable',
    bodyKey: 'error.unreachable.body',
    body: 'The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.',
  },
  rate_limited: {
    titleKey: 'error.rate_limited.title',
    title: 'AI service unavailable',
    bodyKey: 'error.rate_limited.body',
    body: 'The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.',
  },
  not_configured: {
    titleKey: 'error.not_configured.title',
    title: 'AI translation is unavailable',
    bodyKey: 'error.not_configured.body',
    body: 'AI translation is not set up correctly. Ask an administrator to check the AI configuration. Manual translation still works.',
  },
  permission: {
    titleKey: 'error.permission.title',
    title: 'Permission required',
    bodyKey: 'error.permission.body',
    body: 'You no longer have permission for this AI translation. Manual translation still works. Ask an administrator for access.',
  },
  input_rejected: {
    titleKey: 'error.input_rejected.title',
    title: 'AI translation failed',
    bodyKey: 'error.input_rejected.body',
    body: 'The request stopped unexpectedly. Nothing was changed. Try again.',
  },
  invalid_result: {
    titleKey: 'error.invalid_result.title',
    title: 'AI translation failed',
    bodyKey: 'error.invalid_result.body',
    body: 'The request stopped unexpectedly. Nothing was changed. Try again.',
  },
  conflict: {
    titleKey: 'error.conflict.title',
    title: 'AI translation cannot start',
    bodyKey: 'error.conflict.body',
    body: 'The run was refused. If the plugin was just updated, an administrator has to restart the worker first. Nothing was changed.',
  },
  unexpected: {
    titleKey: 'error.unexpected.title',
    title: 'AI translation failed',
    bodyKey: 'error.unexpected.body',
    body: 'The request stopped unexpectedly. Nothing was changed. Try again.',
  },
}

// Map a typed request failure to one fixed visible category. Reads only the
// HTTP status and the plugin's fixed `detail.code` — never a message string. A
// 401 is handled globally by the host interceptor and returns null (render
// nothing); an aborted request is silence, not an error.
export function classifyTranslationError(error) {
  const status = error?.response?.status
  const code = error?.response?.data?.detail?.code

  if (status === 401) return null
  if (status === 403) return 'permission'
  if (status === 409) return code === 'already_running' ? 'already_running' : 'conflict'
  if (status === 429) return 'rate_limited'
  if (status === 503) return code === 'not_configured' ? 'not_configured' : 'unreachable'
  if (status === 504) return 'timeout'
  if (status === 502) return 'unreachable'
  if (status === 422) return code === 'input_rejected' ? 'input_rejected' : 'invalid_result'
  if (typeof status === 'number' && status >= 500) return 'unexpected'

  if (!error?.response) {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'timeout'
    return 'unreachable'
  }
  return 'unexpected'
}

function isReference(value) {
  return (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))
}

function pairKey(field, language) {
  return `${field}\u0000${language}`
}

// Map one authorized suggestion row (SuggestionView) to the neutral proposal the
// host accepts. An opaque suggestion id becomes the reference; an unusable row
// is dropped rather than delivered.
export function suggestionToProposal(row) {
  if (!row || typeof row !== 'object') return null
  const field = row.field
  const language = row.language_code
  const value = row.proposed_text
  const reference = row.suggestion_id
  if (typeof field !== 'string' || field === '') return null
  if (typeof language !== 'string' || language === '') return null
  if (typeof value !== 'string' || value === '') return null
  if (!isReference(reference)) return null
  return { field, language, value, reference }
}

// Deliver only proposals for the current eligible pairs (the host merges against
// the latest synchronous state too; this is the plugin-side narrowing).
export function proposalsForEligible(rows, eligible) {
  const allowed = new Set((Array.isArray(eligible) ? eligible : []).map((pair) => pairKey(pair.field, pair.language)))
  const proposals = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const proposal = suggestionToProposal(row)
    if (!proposal) continue
    if (allowed.size > 0 && !allowed.has(pairKey(proposal.field, proposal.language))) continue
    proposals.push(proposal)
  }
  return proposals
}

// ---------------------------------------------------------------------------
// Panel controller (S1, D-01/D-02/D-04/D-07/D-10/D-15/D-16)
// ---------------------------------------------------------------------------

// A side-effect-free presence predicate: one authorized GET decides whether the
// contribution has anything to deliver (a configured LLM or existing open
// suggestions). It NEVER delivers a draft; the mounted component does that.
export async function panelIsPresent({ api, entityType, entityId } = {}) {
  try {
    const response = await api.get(PANEL_STATUS_PATH, {
      params: { translation_type: entityType, entity_id: entityId },
    })
    const data = response?.data ?? {}
    if (data.available === true) return true
    return typeof data.open_count === 'number' && data.open_count > 0
  } catch {
    return false
  }
}

export function createPanelTranslationController({
  api,
  requestScope,
  entityType,
  entityId,
  sessionId,
  scopeRevision,
  registerDraftHandlers,
  acceptDraft,
  getEligiblePairs,
  getSession,
  getRequestScope,
  onEvent,
} = {}) {
  let active = null

  function isPending() {
    return active !== null
  }

  function currentEligible() {
    if (typeof getEligiblePairs !== 'function') return []
    const pairs = getEligiblePairs()
    return Array.isArray(pairs) ? pairs : []
  }

  // The host replaces the panel draft session after mount (a fresh session per
  // entity/reopen), so the identity captured at construction is stale by the
  // time a proposal is delivered. Resolve it at call time through `getSession`
  // and fall back to the constructor values for callers that pass none.
  function currentSession() {
    if (typeof getSession === 'function') {
      const value = getSession()
      if (value && typeof value === 'object') return value
    }
    return { sessionId, scopeRevision }
  }

  // The host swaps its request scope after mount too, so resolve it at call
  // time. The panel host contract is `{ isCurrent(), signal }`; the attempt
  // facade (`beginAttempt()`) is optional and honoured when present.
  function currentRequestScope() {
    if (typeof getRequestScope === 'function') {
      const value = getRequestScope()
      if (value && typeof value === 'object') return value
    }
    return requestScope
  }

  function deliver(rows, eligible) {
    const proposals = proposalsForEligible(rows, eligible)
    if (proposals.length === 0 || typeof acceptDraft !== 'function') {
      return { applied: [], skipped: [], rejected: [] }
    }
    const { sessionId: liveSessionId, scopeRevision: liveScopeRevision } = currentSession()
    return acceptDraft({
      sessionId: liveSessionId,
      scopeRevision: liveScopeRevision,
      proposals,
    })
  }

  // Mount-time reload: deliver existing open suggestions for this entity. Works
  // with `available === false` (D-16); loading is silent and moves no focus.
  async function loadExistingSuggestions() {
    try {
      const response = await api.get(PANEL_SUGGESTIONS_PATH, {
        params: { translation_type: entityType, entity_id: entityId },
      })
      return deliver(response?.data, currentEligible())
    } catch (error) {
      // A reload failure is silent; it is never surfaced as a generation error.
      classifyTranslationError(error)
      return { applied: [], skipped: [], rejected: [] }
    }
  }

  // One deliberate click sends exactly one request for the currently eligible
  // pairs. A second click while one is in flight is refused synchronously.
  async function generate() {
    if (isPending()) return { ok: false, reason: 'pending' }

    const eligible = currentEligible()
    if (eligible.length === 0) return { ok: false, reason: 'no_eligible' }

    const scope = currentRequestScope()
    const hasAttemptFacade = typeof scope?.beginAttempt === 'function'
    const hasScopeGuard = typeof scope?.isCurrent === 'function'
    if (!hasAttemptFacade && !hasScopeGuard) {
      return { ok: false, reason: 'invalid' }
    }

    const attempt = hasAttemptFacade
      ? scope.beginAttempt()
      : { signal: scope.signal, isCurrent: () => scope.isCurrent() }
    if (!attempt || typeof attempt.isCurrent !== 'function') {
      return { ok: false, reason: 'invalid' }
    }
    active = attempt

    let response
    try {
      response = await api.post(
        PANEL_GENERATE_PATH,
        { translation_type: entityType, entity_id: entityId },
        { signal: attempt?.signal, timeout: GENERATE_TIMEOUT_MS, skipRateLimitRetry: true },
      )
    } catch (error) {
      if (active === attempt) active = null
      if (attempt?.signal?.aborted) return { ok: false, reason: 'aborted' }
      const code = classifyTranslationError(error)
      if (code === null) return { ok: false, reason: 'ignored' }
      if (typeof attempt?.isCurrent !== 'function' || !attempt.isCurrent()) {
        return { ok: false, reason: 'stale' }
      }
      if (typeof onEvent === 'function') onEvent({ type: 'error', code })
      return { ok: false, reason: 'error', code }
    }

    if (active === attempt) active = null
    if (typeof attempt?.isCurrent !== 'function' || !attempt.isCurrent()) {
      return { ok: false, reason: 'stale' }
    }

    const result = deliver(response?.data, eligible)
    if (typeof onEvent === 'function') onEvent({ type: 'generated', result })
    return { ok: true, result }
  }

  // Register the protected commit/discard handlers once per mount. The edited
  // value keeps the server-side `fill_missing` mode; the actor is never sent.
  function registerHandlers() {
    if (typeof registerDraftHandlers !== 'function') return () => {}
    return registerDraftHandlers({
      commitDraft: async ({ reference, value }) => {
        try {
          const response = await api.post(
            PANEL_APPLY_PATH,
            { items: [{ suggestion_id: reference, value }] },
            {
              params: { translation_type: entityType, entity_id: entityId },
              skipRateLimitRetry: true,
            },
          )
          const data = response?.data ?? {}
          const rows = Array.isArray(data.results) ? data.results : []
          const match = rows.find((row) => String(row.suggestion_id) === String(reference))
          if (match && (match.status === 'written' || match.status === 'skipped' || match.status === 'invalid')) {
            return { status: match.status, reason: match.reason ?? null }
          }
          if (data.written > 0) return { status: 'written' }
          if (data.skipped > 0) return { status: 'skipped' }
          return { status: 'invalid' }
        } catch {
          return { status: 'invalid' }
        }
      },
      discardDraft: async ({ reference }) => {
        try {
          await api.delete(dataDiscardPath(reference), {
            params: { translation_type: entityType, entity_id: entityId },
          })
          return true
        } catch {
          return false
        }
      },
    })
  }

  return { isPending, generate, loadExistingSuggestions, registerHandlers, currentEligible }
}

// ---------------------------------------------------------------------------
// Schema run status + start (S2, D-02/D-05/D-07/D-09..D-12)
// ---------------------------------------------------------------------------

// A scope-free availability read so the schema section can hide its generation
// controls fail-closed without a translation scope.
export const SCHEMA_AVAILABILITY_PATH = `${PLUGIN_PREFIX}/data/availability`
export const SCHEMA_OPEN_COUNT_PATH = `${PLUGIN_PREFIX}/data/open-count`
export const SCHEMA_SUGGESTIONS_PATH = `${PLUGIN_PREFIX}/data/schema-suggestions`
export const SCHEMA_CANDIDATES_PATH = `${PLUGIN_PREFIX}/data/schema-candidates`

// The six schema translation kinds in canonical order (mirrors the Core page
// noun order and the start parameter enum).
export const SCHEMA_TRANSLATION_TYPES = [
  'object_type',
  'object_type_attribute',
  'select_option',
  'object_value',
  'status',
  'reference_type',
]

// Canonical kind list of a selection: known kinds only, R1 order, no duplicates.
export function normalizeTranslationTypes(value) {
  if (!Array.isArray(value)) return []
  const chosen = new Set(value)
  return SCHEMA_TRANSLATION_TYPES.filter((kind) => chosen.has(kind))
}

// Sum the server's per-kind rows over the SELECTED kinds only; `requestable` is
// what a run would actually ask the model for (missing minus waiting).
export function summarizeSchemaCandidates(items, selected) {
  if (!Array.isArray(items)) return null
  const kinds = new Set(normalizeTranslationTypes(selected))
  let missing = 0
  let waiting = 0
  for (const item of items) {
    if (!item || !kinds.has(item.translation_type)) continue
    missing += toCount(item.missing)
    waiting += toCount(item.waiting)
  }
  return { missing, waiting, requestable: Math.max(0, missing - waiting) }
}

// Why the start button is blocked for the current selection, or null when a run
// may start. A failed count (summary null) never blocks: the run is the gate.
export function schemaStartBlock({ selected, summary } = {}) {
  if (normalizeTranslationTypes(selected).length === 0) return 'none_selected'
  if (summary && summary.requestable === 0) return 'nothing_missing'
  return null
}

// The pre-start count for one schema view. A rejected read is a soft failure:
// the section keeps the start button usable and shows a short notice instead.
export async function loadSchemaCandidates({ api, schemaId } = {}) {
  try {
    const response = await api.get(SCHEMA_CANDIDATES_PATH, {
      params: { schema_id: schemaId },
    })
    const items = response?.data?.items
    return { ok: true, items: Array.isArray(items) ? items : [] }
  } catch {
    return { ok: false, items: null }
  }
}

const TERMINAL_OUTCOMES = new Set(['finished', 'partial', 'provider_stop', 'cancelled', 'failed'])

export function isTerminalOutcome(outcome) {
  return TERMINAL_OUTCOMES.has(outcome)
}

const RUN_ICONS = {
  queued: 'loader-circle',
  running: 'loader-circle',
  finished: 'circle-check',
  partial: 'info',
  cancelled: 'info',
  provider_stop: 'circle-alert',
  failed: 'circle-alert',
}

const RUN_TONES = {
  finished: 'success',
  provider_stop: 'error',
  failed: 'error',
}

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

// Map one safe RunStatus projection to a neutral view: a queued/indeterminate
// state, a determinate running state, or a terminal summary. The counters are
// exactly the entity/text units of the 03 projection.
export function runOutcomeView(run) {
  const outcome = typeof run?.outcome === 'string' ? run.outcome : 'running'
  const total = Number.isFinite(run?.total) && run.total > 0 ? Math.floor(run.total) : null
  const key = outcome === 'running' ? (total !== null ? 'running' : 'queued') : outcome
  return {
    key,
    icon: RUN_ICONS[key] ?? 'info',
    tone: RUN_TONES[key] ?? 'neutral',
    processed: toCount(run?.attempted),
    total,
    determinate: total !== null,
    generated: toCount(run?.generated),
    skipped: toCount(run?.skipped),
    failed: toCount(run?.failed),
    startedAt: run?.started_at ?? null,
    taskId: run?.task_id ?? null,
  }
}

// A bounded, non-overlapping poll of the latest run for one scope. It stops on
// unmount, on a terminal outcome and on permission loss; it never cancels the
// background task. `schedule`/`cancel` are injected so node:test can drive it.
export function createRunStatusController({
  api,
  kind = 'schema',
  schemaId,
  targetLanguage,
  onEvent,
  schedule,
  cancel,
} = {}) {
  const scheduleFn = typeof schedule === 'function' ? schedule : (fn, ms) => setTimeout(fn, ms)
  const cancelFn = typeof cancel === 'function' ? cancel : (handle) => clearTimeout(handle)
  const path = kind === 'ui' ? UI_RUNS_PATH : RUNS_PATH
  const params = kind === 'ui' ? { target_language: targetLanguage } : { schema_id: schemaId }

  let timer = null
  let stopped = true
  let inFlight = false
  let current = null
  let idle = false
  let gracePolls = 0
  let awaitedTaskId = null

  function emit(event) {
    if (typeof onEvent === 'function') onEvent(event)
  }

  function terminal() {
    return current !== null && isTerminalOutcome(current.outcome)
  }

  // A confirmed "no run" answer (404 or an empty 200 body) is ONE decision
  // point. Inside the post-start grace window it merely counts down and keeps
  // polling; once the window is spent the poller parks instead of asking again
  // every RUN_POLL_MS for a run that does not exist.
  function noRun() {
    if (gracePolls > 0) {
      gracePolls -= 1
      idle = false
    } else {
      idle = true
      gracePolls = 0
      awaitedTaskId = null
    }
    current = null
    emit({ type: 'run', run: null })
  }

  function cancelPending() {
    if (timer !== null) {
      cancelFn(timer)
      timer = null
    }
  }

  function stop() {
    stopped = true
    cancelPending()
  }

  async function load() {
    if (inFlight) return current
    inFlight = true
    try {
      const response = await api.get(path, { params })
      const run = response?.data ?? null
      if (run === null) {
        noRun()
        return null
      }
      // `latest_for_schema`/`latest_for_language` order by `started_at desc`, so
      // before the worker has created the row a start answers with the PREVIOUS
      // run. While the grace window is open, a different task id is just as
      // "not ours yet" as a 404: count it down and do not emit it.
      if (gracePolls > 0 && awaitedTaskId !== null && String(run.task_id) !== String(awaitedTaskId)) {
        gracePolls -= 1
        idle = false
        return current
      }
      current = run
      idle = false
      gracePolls = 0
      awaitedTaskId = null
      emit({ type: 'run', run: current })
      return current
    } catch (error) {
      const status = error?.response?.status
      if (status === 404) {
        noRun()
        return null
      }
      const code = classifyTranslationError(error)
      emit({ type: 'run_error', code })
      if (code === 'permission' || code === null) stop()
      return current
    } finally {
      inFlight = false
    }
  }

  function scheduleNext() {
    if (stopped || idle || terminal()) return
    // At most one live timer: a new schedule retires the previous handle
    // instead of orphaning it.
    cancelPending()
    timer = scheduleFn(() => {
      void tick()
    }, RUN_POLL_MS)
  }

  async function tick() {
    timer = null
    if (stopped) return
    await load()
    scheduleNext()
  }

  async function start({ awaitRun = false, taskId = null } = {}) {
    cancelPending()
    stopped = false
    idle = false
    gracePolls = awaitRun ? RUN_START_GRACE_POLLS : 0
    awaitedTaskId = awaitRun && taskId ? taskId : null
    await tick()
    return current
  }

  // One re-check on a client signal (visible tab, focus). It never re-enables
  // background polling on its own: only an existing run schedules the next poll,
  // and a concurrent probe or a stopped/active controller is left alone.
  async function resume() {
    if (stopped || !idle || inFlight) return current
    await load()
    if (current !== null && !terminal()) scheduleNext()
    return current
  }

  return { start, stop, load, resume, terminal, isIdle: () => idle, getCurrent: () => current }
}

// Bind a client-side "look again" signal to an idle run controller. The module
// itself stays DOM-free: `doc`/`win` are injected (SchemaSection passes the real
// globals, the tests pass plain fakes), and the returned function unsubscribes.
export function bindResumeOnVisible(controller, { doc, win } = {}) {
  if (typeof controller?.resume !== 'function' || typeof doc?.addEventListener !== 'function') {
    return () => {}
  }
  function onSignal() {
    if (doc.visibilityState === 'hidden') return
    void controller.resume()
  }
  doc.addEventListener('visibilitychange', onSignal)
  const winBound = typeof win?.addEventListener === 'function'
  if (winBound) win.addEventListener('focus', onSignal)
  return () => {
    if (typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onSignal)
    if (winBound && typeof win.removeEventListener === 'function') win.removeEventListener('focus', onSignal)
  }
}

// One deliberate schema-run start through the real Core POST /tasks gate. It
// never fabricates a plugin start proxy; a second click while in flight is
// refused synchronously.
export function createSchemaTranslationController({ api, schemaId, onEvent } = {}) {
  let pending = false

  async function start({ translationTypes } = {}) {
    const selection =
      translationTypes === undefined ? null : normalizeTranslationTypes(translationTypes)
    if (translationTypes !== undefined && selection.length === 0) {
      return { ok: false, reason: 'invalid' }
    }
    if (pending) return { ok: false, reason: 'pending' }
    pending = true
    try {
      const response = await api.post(TASKS_PATH, {
        tasktype: SCHEMA_TASK_TYPE,
        schema_id: schemaId,
        plugin_parameters: selection ? { translation_types: selection } : {},
        current_step: null,
      })
      const task = response?.data ?? null
      if (typeof onEvent === 'function') onEvent({ type: 'started', task })
      return { ok: true, task }
    } catch (error) {
      const code = classifyTranslationError(error)
      if (code === null) return { ok: false, reason: 'ignored' }
      return { ok: false, reason: 'error', code }
    } finally {
      pending = false
    }
  }

  return { start, isPending: () => pending }
}

// The schema section is present when the LLM is configured OR the schema has
// authorized run history. Both reads are bounded; anything else fails closed.
export async function schemaPresent({ api, schemaId } = {}) {
  const [availability, history] = await Promise.allSettled([
    api.get(SCHEMA_AVAILABILITY_PATH),
    api.get(RUNS_PATH, { params: { schema_id: schemaId } }),
  ])
  if (availability.status === 'fulfilled' && availability.value?.data?.available === true) return true
  if (history.status === 'fulfilled') return true
  return false
}

// ---------------------------------------------------------------------------
// UI language runs + explicit existing-table review/apply (S3/S4,
// D-03/D-06/D-08..D-12/D-15)
// ---------------------------------------------------------------------------

// Normalize the current admin filter into the strict language/filter shape the
// candidate/suggestion reads, the `ai-translation.ui-bulk` task parameters and
// the apply body all share. A set namespace forces `namespace_is_null` false (the
// strict contradiction guard); the "only missing" checkbox is deliberately
// ignored because the server selection already excludes non-missing keys and it
// never changes eligibility.
export function normalizeUiParams({ language, namespace, namespaceIsNull, search } = {}) {
  const targetLanguage = typeof language === 'string' ? language.trim().toLowerCase() : ''
  const ns = typeof namespace === 'string' && namespace.trim() !== '' ? namespace.trim() : null
  const q = typeof search === 'string' && search.trim() !== '' ? search.trim() : null
  return {
    target_language: targetLanguage,
    namespace: ns,
    namespace_is_null: ns === null ? Boolean(namespaceIsNull) : false,
    q,
  }
}

// Distinguish the two distinct empty states the admin row must show and flag a
// count above the 100 block cap. Eligibility never depends on the only-missing
// checkbox.
export function classifyEligibility(candidates) {
  const eligibleTotal = toCount(candidates?.eligible_total)
  const missingTotal = toCount(candidates?.missing_total)
  let state = 'eligible'
  if (missingTotal === 0) state = 'none_missing'
  else if (eligibleTotal === 0) state = 'missing_not_eligible'
  return {
    state,
    eligibleTotal,
    missingTotal,
    overCap: eligibleTotal > UI_BLOCK_CAP,
    hasMore: candidates?.has_more === true,
  }
}

// Side-effect-free presence predicate for the admin action family: absent in the
// authored English source language, present with a configured LLM OR readable
// open suggestions, and failing closed on any error.
export async function uiPresent({ api, language } = {}) {
  const target = typeof language === 'string' ? language.trim().toLowerCase() : ''
  if (target === '' || target === 'en') return false
  try {
    const response = await api.get(UI_STATUS_PATH, { params: { target_language: target } })
    const data = response?.data ?? {}
    if (data.available === true) return true
    return toCount(data.open_count) > 0
  } catch {
    return false
  }
}

// Classify one apply attempt into exactly one honest outcome. A confirmed
// rejection is distinct from an unreceived transport response; the caller blocks
// a replay until a fresh reconciliation.
export function reconcileApplyOutcome(result) {
  if (result && result.error) {
    const error = result.error
    const status = error?.response?.status
    const code = error?.response?.data?.detail?.code
    if (code === 'transaction_failed' || status === 409) return { status: 'rejected' }
    if (code === 'outcome_unknown' || status === 503 || status === undefined) return { status: 'unknown' }
    const category = classifyTranslationError(error)
    if (category === null) return { status: 'ignored' }
    return { status: 'error', code: category }
  }
  const data = result?.response?.data ?? {}
  return {
    status: 'confirmed',
    written: toCount(data.written),
    skipped: toCount(data.skipped),
    invalid: toCount(data.invalid),
    results: Array.isArray(data.results) ? data.results : [],
  }
}

// Map one authorized UiSuggestionView row to the neutral review row + draft the
// host table projects. An unusable row is dropped rather than displayed.
function uiSuggestionToRow(item) {
  if (!item || typeof item !== 'object') return null
  if (!isReference(item.suggestion_id)) return null
  const key = typeof item.key === 'string' ? item.key : ''
  if (key === '') return null
  return {
    uiStringId: String(item.suggestion_id),
    namespace: typeof item.namespace === 'string' && item.namespace !== '' ? item.namespace : null,
    key,
    codeDefault: typeof item.source_text === 'string' ? item.source_text : '',
    reference: item.suggestion_id,
    value: typeof item.proposed_text === 'string' ? item.proposed_text : '',
  }
}

// The admin review/apply controller: one deliberate start per click, a
// language-wide status poll, a scope-fenced review projection with local edits,
// an explicit displayed-block apply and a per-row discard. It owns no provider
// client and never replays an uncertain write.
export function createUiTranslationController({
  api,
  getFilters,
  getScopeRevision,
  publishReview,
  leaveReview,
  refreshCatalog,
  onEvent,
  invalidReasonText,
  schedule,
  cancel,
} = {}) {
  const scheduleFn = typeof schedule === 'function' ? schedule : (fn, ms) => setTimeout(fn, ms)
  const cancelFn = typeof cancel === 'function' ? cancel : (handle) => clearTimeout(handle)

  let runController = null
  let pendingStart = false
  let autoReviewPending = false
  let blocked = false
  let eligibility = null
  let suggestionTotal = 0
  let review = null
  let currentRun = null
  const draftOverrides = new Map()
  const invalidIds = new Set()

  function emit(event) {
    if (typeof onEvent === 'function') onEvent(event)
  }

  function params() {
    const filters = typeof getFilters === 'function' ? getFilters() : {}
    return normalizeUiParams(filters ?? {})
  }

  function revision() {
    return typeof getScopeRevision === 'function' ? getScopeRevision() : 0
  }

  function getReview() {
    return review
  }

  function ensureRunController(language) {
    if (runController !== null) return runController
    runController = createRunStatusController({
      api,
      kind: 'ui',
      targetLanguage: language,
      onEvent: (event) => {
        if (event.type === 'run') {
          currentRun = event.run
          emit({ type: 'run', run: event.run })
          if (event.run && isTerminalOutcome(event.run.outcome)) {
            runController.stop()
            if (autoReviewPending && toCount(event.run.generated) > 0) {
              autoReviewPending = false
              void enterReview({ focus: false, automatic: true })
            }
          }
        } else if (event.type === 'run_error') {
          emit({ type: 'run_error', code: event.code })
        }
      },
      schedule: scheduleFn,
      cancel: cancelFn,
    })
    return runController
  }

  // Read the current-scope eligibility block and the filter-wide open count.
  async function load() {
    const query = params()
    const [candidates, suggestions] = await Promise.allSettled([
      api.get(UI_CANDIDATES_PATH, { params: query }),
      api.get(UI_SUGGESTIONS_PATH, { params: query }),
    ])
    eligibility = candidates.status === 'fulfilled' ? classifyEligibility(candidates.value?.data) : null
    suggestionTotal = suggestions.status === 'fulfilled' ? toCount(suggestions.value?.data?.total) : 0
    emit({ type: 'eligibility', eligibility, suggestionTotal })
    return { eligibility, suggestionTotal }
  }

  // One deliberate click starts one run for the current language/filter. It
  // never starts the next block on its own.
  async function start() {
    if (pendingStart) return { ok: false, reason: 'pending' }
    pendingStart = true
    try {
      const query = params()
      const response = await api.post(TASKS_PATH, {
        tasktype: UI_TASK_TYPE,
        plugin_parameters: query,
        current_step: null,
      })
      const task = response?.data ?? null
      autoReviewPending = true
      const controller = ensureRunController(query.target_language)
      controller.stop()
      void controller.start({ awaitRun: true, taskId: task?.id ?? null })
      emit({ type: 'started', task })
      return { ok: true, task }
    } catch (error) {
      const code = classifyTranslationError(error)
      if (code === null) return { ok: false, reason: 'ignored' }
      emit({ type: 'start_error', code })
      return { ok: false, reason: 'error', code }
    } finally {
      pendingStart = false
    }
  }

  // Enter the narrowed review view: publish the current ≤100 namespace/key rows
  // and draft references to the existing table, preserving any local edits. A
  // scope that has already changed is fenced out.
  async function enterReview({ focus = true, automatic = false } = {}) {
    const query = params()
    const capturedRevision = revision()
    let response
    try {
      response = await api.get(UI_SUGGESTIONS_PATH, { params: query })
    } catch (error) {
      const code = classifyTranslationError(error)
      return { ok: false, reason: 'error', code }
    }
    if (revision() !== capturedRevision) return { ok: false, reason: 'stale' }

    const items = Array.isArray(response?.data?.items) ? response.data.items : []
    const mapped = items.map(uiSuggestionToRow).filter(Boolean)
    if (mapped.length === 0) {
      review = null
      if (typeof leaveReview === 'function') leaveReview()
      emit({ type: 'review_empty', automatic })
      return { ok: true, count: 0, rows: [], drafts: [], total: 0 }
    }

    const rows = mapped.map((row) => ({
      uiStringId: row.uiStringId,
      namespace: row.namespace,
      key: row.key,
      codeDefault: row.codeDefault,
    }))
    const reasonText = typeof invalidReasonText === 'function' ? invalidReasonText() : null
    const drafts = mapped.map((row) => ({
      uiStringId: row.uiStringId,
      value: draftOverrides.has(row.uiStringId) ? draftOverrides.get(row.uiStringId) : row.value,
      reference: row.reference,
      ...(invalidIds.has(row.uiStringId) ? { invalid: true, reasonText } : {}),
    }))
    const total = toCount(response?.data?.total) || mapped.length

    const published =
      typeof publishReview === 'function'
        ? publishReview({
            scopeRevision: capturedRevision,
            rows,
            drafts,
            total,
            onDraftChange: setDraftValue,
            onDiscard: discard,
          })
        : true
    if (published === false) {
      review = null
      return { ok: false, reason: 'stale' }
    }

    review = { rows: rows.map((row, index) => ({ ...row, draft: { ...drafts[index] } })), drafts, total }
    emit({ type: 'review', count: mapped.length, total, focus, automatic })
    return { ok: true, count: mapped.length, rows, drafts, total }
  }

  // Local-only draft edit: never autosaves.
  function setDraftValue(uiStringId, value) {
    if (!isReference(uiStringId)) return false
    const id = String(uiStringId)
    const next = typeof value === 'string' ? value : ''
    draftOverrides.set(id, next)
    if (review) {
      const draft = review.drafts.find((entry) => entry.uiStringId === id)
      if (draft) draft.value = next
      const row = review.rows.find((entry) => entry.uiStringId === id)
      if (row?.draft) row.draft.value = next
    }
    return true
  }

  function removeSettledRows(results) {
    if (!review) return
    const settled = new Set()
    invalidIds.clear()
    for (const row of Array.isArray(results) ? results : []) {
      if (row?.status === 'written' || row?.status === 'skipped') settled.add(String(row.suggestion_id))
      else if (row?.status === 'invalid') invalidIds.add(String(row.suggestion_id))
    }
    if (settled.size === 0) return
    settled.forEach((id) => draftOverrides.delete(id))
    review.rows = review.rows.filter((row) => !settled.has(row.uiStringId))
    review.drafts = review.drafts.filter((draft) => !settled.has(draft.uiStringId))
    review.total = Math.max(0, review.total - settled.size)
    if (review.rows.length === 0) review = null
  }

  // Commit exactly the displayed, edited drafts. No transport replay; a confirmed
  // rejection and an unknown outcome are distinct and an unknown outcome blocks
  // another apply until reconciliation.
  async function apply() {
    if (blocked) return { status: 'blocked' }
    if (!review || review.drafts.length === 0) return { status: 'empty' }
    const query = params()
    const items = review.drafts.map((draft) => ({ suggestion_id: draft.reference, value: draft.value }))
    let response
    let error
    try {
      response = await api.post(
        UI_APPLY_PATH,
        {
          target_language: query.target_language,
          namespace: query.namespace,
          namespace_is_null: query.namespace_is_null,
          q: query.q,
          items,
        },
        { skipRateLimitRetry: true },
      )
    } catch (caught) {
      error = caught
    }
    const outcome = reconcileApplyOutcome(error ? { error } : { response })
    if (outcome.status === 'confirmed') {
      emit({ type: 'applied', written: outcome.written, skipped: outcome.skipped, invalid: outcome.invalid })
      if (typeof refreshCatalog === 'function') refreshCatalog()
      removeSettledRows(outcome.results)
      void enterReview({ focus: false })
      return outcome
    }
    if (outcome.status === 'unknown') {
      blocked = true
      emit({ type: 'apply_unknown' })
      return outcome
    }
    if (outcome.status === 'rejected') {
      emit({ type: 'apply_rejected' })
      return outcome
    }
    emit({ type: 'apply_error', code: outcome.code })
    return outcome
  }

  // Refetch the current suggestions + catalogue after an unknown outcome; this is
  // the only thing that lifts the replay block.
  async function reconcile() {
    blocked = false
    await load()
    if (review) await enterReview({ focus: false })
    return { ok: true }
  }

  // Discard one row only after a confirmed server tombstone; otherwise it stays.
  async function discard(uiStringId) {
    if (!isReference(uiStringId)) return false
    const id = String(uiStringId)
    const query = params()
    try {
      await api.delete(uiDiscardPath(uiStringId), {
        params: {
          target_language: query.target_language,
          namespace: query.namespace,
          namespace_is_null: query.namespace_is_null,
          q: query.q,
        },
      })
    } catch {
      emit({ type: 'discard_error', uiStringId: id })
      return false
    }
    draftOverrides.delete(id)
    invalidIds.delete(id)
    if (review) {
      review.rows = review.rows.filter((row) => row.uiStringId !== id)
      review.drafts = review.drafts.filter((draft) => draft.uiStringId !== id)
      review.total = Math.max(0, review.total - 1)
      if (review.rows.length === 0) review = null
    }
    emit({ type: 'discarded', uiStringId: id })
    return true
  }

  function stop() {
    if (runController) runController.stop()
  }

  // Client-signal re-check (visible tab/focus): only the run controller decides
  // whether there is anything to poll.
  function resume() {
    if (runController) return runController.resume()
    return Promise.resolve(null)
  }

  // A new scope always returns to browse: drop the projection and local edits.
  function clearReview() {
    review = null
    draftOverrides.clear()
    invalidIds.clear()
  }

  return {
    load,
    start,
    enterReview,
    setDraftValue,
    apply,
    reconcile,
    discard,
    stop,
    resume,
    clearReview,
    blocked: () => blocked,
    getEligibility: () => eligibility,
    getSuggestionTotal: () => suggestionTotal,
    getReview,
    getRun: () => currentRun,
  }
}
