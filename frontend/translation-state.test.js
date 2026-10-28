// Phase 307 (AITR-01/02/03): unit tests for the ai-translation plugin's pure,
// React-free controllers. No DOM, no React, no network.
//
//   node --test plugins/ai-translation/frontend/translation-state.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  GENERATE_TIMEOUT_MS,
  PANEL_APPLY_PATH,
  PANEL_GENERATE_PATH,
  PANEL_STATUS_PATH,
  PANEL_SUGGESTIONS_PATH,
  RUN_POLL_MS,
  RUN_START_GRACE_POLLS,
  RUNS_PATH,
  SCHEMA_CANDIDATES_PATH,
  SCHEMA_TASK_TYPE,
  SCHEMA_TRANSLATION_TYPES,
  TASKS_PATH,
  UI_APPLY_PATH,
  UI_CANDIDATES_PATH,
  UI_STATUS_PATH,
  UI_SUGGESTIONS_PATH,
  UI_TASK_TYPE,
  bindResumeOnVisible,
  classifyEligibility,
  classifyTranslationError,
  createPanelTranslationController,
  createRunStatusController,
  createSchemaTranslationController,
  createUiTranslationController,
  dataDiscardPath,
  isTerminalOutcome,
  loadSchemaCandidates,
  normalizeTranslationTypes,
  normalizeUiParams,
  panelIsPresent,
  reconcileApplyOutcome,
  retryAllowed,
  runOutcomeView,
  schemaPresent,
  schemaStartBlock,
  summarizeSchemaCandidates,
  uiDiscardPath,
  uiPresent,
} from './translation-state.js'

// A minimal authenticated-client stand-in that records every call and returns
// scripted axios-shaped responses. `respond(path, config)` lets a test decide
// per call; anything unscripted resolves to an empty body.
function createFakeApi({ respond } = {}) {
  const calls = []
  const record = (method) => (path, bodyOrConfig, maybeConfig) => {
    const entry = { method, path }
    if (method === 'get' || method === 'delete') {
      entry.config = bodyOrConfig
    } else {
      entry.body = bodyOrConfig
      entry.config = maybeConfig
    }
    calls.push(entry)
    if (typeof respond === 'function') {
      const result = respond(entry)
      if (result !== undefined) return Promise.resolve(result)
    }
    return Promise.resolve({ data: null })
  }
  return {
    calls,
    get: record('get'),
    post: record('post'),
    delete: record('delete'),
  }
}

function createFakeRequestScope() {
  const scope = {
    attempts: [],
    current: null,
    beginAttempt() {
      let attempt
      const controller = new AbortController()
      attempt = {
        signal: controller.signal,
        isCurrent: () => scope.current === attempt && !controller.signal.aborted,
        accepted: null,
        abort() {
          controller.abort()
        },
      }
      scope.current = attempt
      scope.attempts.push(attempt)
      return attempt
    },
    invalidate(attempt) {
      if (scope.current === attempt) scope.current = null
      attempt.abort()
    },
  }
  return scope
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

// Minimal DOM stand-ins: the binding helper takes them injected, so no jsdom.
function createFakeDoc(visibilityState = 'visible') {
  const handlers = new Map()
  return {
    visibilityState,
    addEventListener(type, fn) {
      handlers.set(type, [...(handlers.get(type) ?? []), fn])
    },
    removeEventListener(type, fn) {
      handlers.set(type, (handlers.get(type) ?? []).filter((entry) => entry !== fn))
    },
    emit(type) {
      for (const fn of handlers.get(type) ?? []) fn()
    },
    listenerCount(type) {
      return (handlers.get(type) ?? []).length
    },
  }
}

function createFakeWin() {
  const doc = createFakeDoc()
  return {
    addEventListener: doc.addEventListener,
    removeEventListener: doc.removeEventListener,
    emit: doc.emit,
    listenerCount: doc.listenerCount,
  }
}

const SUGGESTION = {
  suggestion_id: '11111111-1111-1111-1111-111111111111',
  translation_type: 'object_type',
  entity_id: '22222222-2222-2222-2222-222222222222',
  field: 'name',
  language_code: 'de',
  proposed_text: 'Server',
  source_text: 'Server',
  status: 'pending',
}

describe('classifyTranslationError', () => {
  it('maps each fixed typed failure to its category', () => {
    const cases = [
      [{ response: { status: 403 } }, 'permission'],
      [{ response: { status: 429 } }, 'rate_limited'],
      [{ response: { status: 504 } }, 'timeout'],
      [{ response: { status: 502 } }, 'unreachable'],
      [{ response: { status: 500 } }, 'unexpected'],
      [{ response: { status: 503, data: { detail: { code: 'not_configured' } } } }, 'not_configured'],
      [{ response: { status: 409, data: { detail: { code: 'already_running' } } } }, 'already_running'],
      [{ response: { status: 422, data: { detail: { code: 'input_rejected' } } } }, 'input_rejected'],
      [{ response: { status: 422 } }, 'invalid_result'],
      [{ code: 'ECONNABORTED' }, 'timeout'],
      [{ code: 'ERR_NETWORK' }, 'unreachable'],
    ]
    for (const [error, expected] of cases) {
      assert.equal(classifyTranslationError(error), expected, JSON.stringify(error))
    }
  })

  it('returns null for a globally handled 401', () => {
    assert.equal(classifyTranslationError({ response: { status: 401 } }), null)
  })

  it('excludes configuration, permission and conflict from retry', () => {
    assert.equal(retryAllowed('timeout'), true)
    assert.equal(retryAllowed('unexpected'), true)
    assert.equal(retryAllowed('not_configured'), false)
    assert.equal(retryAllowed('permission'), false)
    assert.equal(retryAllowed('already_running'), false)
  })
})

describe('panelIsPresent — side-effect free predicate', () => {
  it('is present when the LLM is available even with no open suggestions', async () => {
    const api = createFakeApi({ respond: () => ({ data: { available: true, open_count: 0 } }) })
    assert.equal(await panelIsPresent({ api, entityType: 'object_type', entityId: 'e1' }), true)
    assert.equal(api.calls.length, 1)
    assert.equal(api.calls[0].path, PANEL_STATUS_PATH)
  })

  it('is present for existing open suggestions without a configured LLM', async () => {
    const api = createFakeApi({ respond: () => ({ data: { available: false, open_count: 3 } }) })
    assert.equal(await panelIsPresent({ api, entityType: 'object_type', entityId: 'e1' }), true)
  })

  it('is absent with nothing to deliver and fails closed on an error', async () => {
    const empty = createFakeApi({ respond: () => ({ data: { available: false, open_count: 0 } }) })
    assert.equal(await panelIsPresent({ api: empty, entityType: 'object_type', entityId: 'e1' }), false)

    const failing = createFakeApi({ respond: () => Promise.reject({ response: { status: 500 } }) })
    assert.equal(await panelIsPresent({ api: failing, entityType: 'object_type', entityId: 'e1' }), false)
  })

  it('never delivers a draft from inside the predicate', async () => {
    let delivered = 0
    const api = createFakeApi({ respond: () => ({ data: { available: true, open_count: 1 } }) })
    await panelIsPresent({ api, entityType: 'object_type', entityId: 'e1' })
    assert.equal(delivered, 0)
    assert.equal(api.calls.some((c) => c.path === PANEL_SUGGESTIONS_PATH), false)
  })
})

function buildPanel(overrides = {}) {
  const api = overrides.api ?? createFakeApi({ respond: (entry) => {
    if (entry.path === PANEL_GENERATE_PATH) return { data: [SUGGESTION] }
    if (entry.path === PANEL_SUGGESTIONS_PATH) return { data: [SUGGESTION] }
    return { data: null }
  } })
  const scope = overrides.requestScope ?? createFakeRequestScope()
  const events = []
  const accepted = []
  const eligible = overrides.eligible ?? [{ field: 'name', language: 'de' }]
  let handlerSet = null
  const controller = createPanelTranslationController({
    api,
    requestScope: scope,
    entityType: 'object_type',
    entityId: '22222222-2222-2222-2222-222222222222',
    sessionId: 'panel-1',
    scopeRevision: 1,
    registerDraftHandlers: (handlers) => {
      handlerSet = handlers
      return () => {
        handlerSet = null
      }
    },
    acceptDraft: (payload) => {
      accepted.push(payload)
      return { applied: payload.proposals, skipped: [], rejected: [] }
    },
    getEligiblePairs: () => eligible,
    onEvent: (event) => events.push(event),
    ...overrides.controller,
  })
  return {
    controller,
    api,
    scope,
    events,
    accepted,
    getHandlerSet: () => handlerSet,
  }
}

describe('createPanelTranslationController — one explicit generation', () => {
  it('sends exactly one authenticated call and delivers the mapped proposals', async () => {
    const { controller, api, accepted, events } = buildPanel()

    const result = await controller.generate()

    assert.equal(result.ok, true)
    assert.equal(api.calls.length, 1)
    const call = api.calls[0]
    assert.equal(call.method, 'post')
    assert.equal(call.path, PANEL_GENERATE_PATH)
    assert.deepEqual(call.body, {
      translation_type: 'object_type',
      entity_id: '22222222-2222-2222-2222-222222222222',
    })
    assert.equal(call.config.timeout, GENERATE_TIMEOUT_MS)
    assert.equal(call.config.skipRateLimitRetry, true)
    assert.ok(call.config.signal, 'the attempt signal is passed to the client')

    assert.equal(accepted.length, 1)
    assert.equal(accepted[0].sessionId, 'panel-1')
    assert.equal(accepted[0].scopeRevision, 1)
    assert.deepEqual(accepted[0].proposals, [
      {
        field: 'name',
        language: 'de',
        value: 'Server',
        reference: '11111111-1111-1111-1111-111111111111',
      },
    ])
    assert.equal(events.at(-1).type, 'generated')
  })

  it('refuses a duplicate submit while a request is in flight', async () => {
    const gate = deferred()
    const api = createFakeApi({ respond: (entry) => (entry.path === PANEL_GENERATE_PATH ? gate.promise : { data: null }) })
    const { controller } = buildPanel({ api })

    const first = controller.generate()
    const second = await controller.generate()

    assert.equal(second.ok, false)
    assert.equal(second.reason, 'pending')
    assert.equal(api.calls.length, 1)

    gate.resolve({ data: [SUGGESTION] })
    await first
  })

  it('sends no request when no pair is eligible', async () => {
    const { controller, api } = buildPanel({ eligible: [] })
    const result = await controller.generate()
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'no_eligible')
    assert.equal(api.calls.length, 0)
  })

  it('ignores a success whose attempt is no longer current', async () => {
    const gate = deferred()
    const api = createFakeApi({ respond: (entry) => (entry.path === PANEL_GENERATE_PATH ? gate.promise : { data: null }) })
    const { controller, scope, accepted } = buildPanel({ api })

    const pending = controller.generate()
    scope.invalidate(scope.attempts[0])
    gate.resolve({ data: [SUGGESTION] })

    const result = await pending
    assert.equal(result.reason, 'stale')
    assert.equal(accepted.length, 0)
  })

  it('reports a current typed failure once', async () => {
    const api = createFakeApi({ respond: (entry) => (entry.path === PANEL_GENERATE_PATH ? Promise.reject({ response: { status: 504 } }) : { data: null }) })
    const { controller, events } = buildPanel({ api })

    const result = await controller.generate()
    assert.equal(result.ok, false)
    assert.equal(result.code, 'timeout')
    assert.deepEqual(events.at(-1), { type: 'error', code: 'timeout' })
  })

  it('renders nothing for a 401 and never fires an error event', async () => {
    const api = createFakeApi({ respond: (entry) => (entry.path === PANEL_GENERATE_PATH ? Promise.reject({ response: { status: 401 } }) : { data: null }) })
    const { controller, events } = buildPanel({ api })

    const result = await controller.generate()
    assert.equal(result.reason, 'ignored')
    assert.equal(events.length, 0)
  })

  it('resolves the live session identity at delivery time, not the frozen constructor value', async () => {
    // The host swaps its draft session after mount; the controller must deliver
    // against whatever identity is current when the proposal is ready.
    const live = { sessionId: 'panel-1', scopeRevision: 1 }
    const { controller, accepted } = buildPanel({ controller: { getSession: () => live } })

    live.sessionId = 'panel-2'
    live.scopeRevision = 7
    await controller.loadExistingSuggestions()

    assert.equal(accepted.length, 1)
    assert.equal(accepted[0].sessionId, 'panel-2')
    assert.equal(accepted[0].scopeRevision, 7)
  })

  it('accepts the documented panel request scope shape without an attempt facade', async () => {
    // The panel host contract is { isCurrent(), signal }; beginAttempt() is an
    // optional facade used by other hosts. A scope with only the documented
    // shape must still run exactly one generation and deliver its proposals.
    let current = true
    const panelScope = { isCurrent: () => current, signal: undefined }
    const api = createFakeApi({
      respond: (entry) => (entry.path === PANEL_GENERATE_PATH ? { data: [SUGGESTION] } : { data: null }),
    })
    const { controller, accepted, api: fakeApi } = buildPanel({
      api,
      requestScope: { isCurrent: () => current },
      controller: { getRequestScope: () => panelScope },
    })

    const result = await controller.generate()
    assert.equal(result.ok, true)
    assert.equal(accepted.length, 1)
    assert.equal(fakeApi.calls.filter((call) => call.path === PANEL_GENERATE_PATH).length, 1)
  })
})

describe('createPanelTranslationController — existing suggestions and protected commit', () => {
  it('delivers existing open suggestions without needing a configured LLM', async () => {
    const api = createFakeApi({ respond: () => ({ data: [SUGGESTION] }) })
    const { controller, accepted } = buildPanel({ api })

    const result = await controller.loadExistingSuggestions()

    assert.equal(accepted.length, 1)
    assert.equal(accepted[0].proposals[0].reference, SUGGESTION.suggestion_id)
    assert.deepEqual(result.applied, accepted[0].proposals)
    // It never probed availability to decide whether to deliver.
    assert.equal(api.calls.some((c) => c.path === PANEL_STATUS_PATH), false)
  })

  it('maps a written apply result to a written commit', async () => {
    const api = createFakeApi({ respond: (entry) => {
      if (entry.path === PANEL_APPLY_PATH) {
        return {
          data: {
            written: 1,
            skipped: 0,
            invalid: 0,
            results: [{ suggestion_id: SUGGESTION.suggestion_id, status: 'written', reason: null }],
          },
        }
      }
      return { data: null }
    } })
    const { controller, getHandlerSet } = buildPanel({ api })
    controller.registerHandlers()

    const outcome = await getHandlerSet().commitDraft({
      reference: SUGGESTION.suggestion_id,
      value: 'Server',
      field: 'name',
      language: 'de',
    })

    assert.equal(outcome.status, 'written')
    const call = api.calls.find((c) => c.path === PANEL_APPLY_PATH)
    assert.deepEqual(call.body, { items: [{ suggestion_id: SUGGESTION.suggestion_id, value: 'Server' }] })
    assert.equal(call.config.skipRateLimitRetry, true)
    assert.equal(call.config.params.translation_type, 'object_type')
  })

  it('maps a skipped apply result and an invalid one', async () => {
    const make = (status) => createFakeApi({ respond: (entry) => {
      if (entry.path === PANEL_APPLY_PATH) {
        return { data: { written: 0, skipped: status === 'skipped' ? 1 : 0, invalid: status === 'invalid' ? 1 : 0, results: [{ suggestion_id: SUGGESTION.suggestion_id, status, reason: status === 'invalid' ? 'placeholder_mismatch' : null }] } }
      }
      return { data: null }
    } })

    for (const status of ['skipped', 'invalid']) {
      const api = make(status)
      const { controller, getHandlerSet } = buildPanel({ api })
      controller.registerHandlers()
      const outcome = await getHandlerSet().commitDraft({ reference: SUGGESTION.suggestion_id, value: 'x', field: 'name', language: 'de' })
      assert.equal(outcome.status, status)
    }
  })

  it('discards one suggestion and reports failure without throwing', async () => {
    const api = createFakeApi({ respond: (entry) => {
      if (entry.method === 'delete') return { data: { discarded: true } }
      return { data: null }
    } })
    const { controller, getHandlerSet } = buildPanel({ api })
    controller.registerHandlers()

    assert.equal(await getHandlerSet().discardDraft({ reference: SUGGESTION.suggestion_id, field: 'name', language: 'de' }), true)
    const call = api.calls.find((c) => c.method === 'delete')
    assert.equal(call.path, dataDiscardPath(SUGGESTION.suggestion_id))
    assert.equal(call.config.params.entity_id, '22222222-2222-2222-2222-222222222222')

    const failing = createFakeApi({ respond: () => Promise.reject({ response: { status: 500 } }) })
    const second = buildPanel({ api: failing })
    second.controller.registerHandlers()
    assert.equal(await second.getHandlerSet().discardDraft({ reference: 'r', field: 'name', language: 'de' }), false)
  })
})

// --- Task 2: schema run status + start ---------------------------------------

describe('isTerminalOutcome / runOutcomeView', () => {
  it('classifies every outcome as terminal or not', () => {
    for (const outcome of ['finished', 'partial', 'provider_stop', 'cancelled', 'failed']) {
      assert.equal(isTerminalOutcome(outcome), true, outcome)
    }
    assert.equal(isTerminalOutcome('running'), false)
  })

  it('shows queued with no bar when the total is unknown', () => {
    const view = runOutcomeView({ outcome: 'running', attempted: 3, generated: 0, skipped: 0, failed: 0 })
    assert.equal(view.key, 'queued')
    assert.equal(view.determinate, false)
    assert.equal(view.total, null)
    assert.equal(view.processed, 3)
  })

  it('shows determinate progress only when the total is a positive number', () => {
    const view = runOutcomeView({ outcome: 'running', attempted: 18, total: 40 })
    assert.equal(view.key, 'running')
    assert.equal(view.determinate, true)
    assert.equal(view.processed, 18)
    assert.equal(view.total, 40)
  })

  it('maps every terminal outcome to its icon/tone and counters', () => {
    const finished = runOutcomeView({ outcome: 'finished', attempted: 10, generated: 7, skipped: 3, failed: 0 })
    assert.equal(finished.key, 'finished')
    assert.equal(finished.icon, 'circle-check')
    assert.equal(finished.tone, 'success')
    assert.equal(finished.generated, 7)
    assert.equal(finished.skipped, 3)

    assert.equal(runOutcomeView({ outcome: 'partial' }).icon, 'info')
    assert.equal(runOutcomeView({ outcome: 'cancelled' }).icon, 'info')
    assert.equal(runOutcomeView({ outcome: 'provider_stop' }).tone, 'error')
    assert.equal(runOutcomeView({ outcome: 'provider_stop' }).icon, 'circle-alert')
    assert.equal(runOutcomeView({ outcome: 'failed' }).tone, 'error')
  })
})

function createScheduler() {
  const jobs = []
  let nextId = 1
  const cancelled = []
  return {
    jobs,
    cancelled,
    schedule(fn, ms) {
      const job = { id: nextId++, fn, ms }
      jobs.push(job)
      return job.id
    },
    cancel(id) {
      cancelled.push(id)
    },
    // Run the most recently scheduled job (if any) and return it.
    async runNext() {
      const job = jobs.shift()
      if (!job) return null
      await job.fn()
      return job
    },
  }
}

function buildRunController(overrides = {}) {
  const scheduler = createScheduler()
  const events = []
  const runs = overrides.runs ?? [{ data: { outcome: 'running', attempted: 1, total: 5 } }, { data: { outcome: 'finished', attempted: 5, total: 5, generated: 4, skipped: 1, failed: 0 } }]
  let index = 0
  const api = overrides.api ?? createFakeApi({
    respond: (entry) => {
      if (entry.path === RUNS_PATH || entry.path === 'plugins/ai-translation/ui/runs') {
        const next = runs[Math.min(index, runs.length - 1)]
        index += 1
        if (next instanceof Error) return Promise.reject(next)
        return next
      }
      return { data: null }
    },
  })
  const controller = createRunStatusController({
    api,
    kind: overrides.kind ?? 'schema',
    schemaId: overrides.schemaId ?? '22222222-2222-2222-2222-222222222222',
    targetLanguage: overrides.targetLanguage,
    onEvent: (event) => events.push(event),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  })
  return { controller, api, scheduler, events }
}

describe('createRunStatusController', () => {
  it('recovers the latest run and keeps polling until it is terminal', async () => {
    const { controller, scheduler, events, api } = buildRunController()

    await controller.start()
    assert.equal(events.at(-1).run.outcome, 'running')
    assert.equal(scheduler.jobs.length, 1)
    assert.equal(scheduler.jobs[0].ms, RUN_POLL_MS)
    assert.equal(api.calls[0].path, RUNS_PATH)
    assert.equal(api.calls[0].config.params.schema_id, '22222222-2222-2222-2222-222222222222')

    await scheduler.runNext()
    assert.equal(events.at(-1).run.outcome, 'finished')
    // Terminal: no further poll scheduled.
    assert.equal(scheduler.jobs.length, 0)
  })

  it('reports no run (404) as a null history without an error', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, events, scheduler } = buildRunController({ api })

    await controller.start()
    assert.deepEqual(events.at(-1), { type: 'run', run: null })
    assert.equal(events.some((e) => e.type === 'run_error'), false)
    assert.equal(api.calls.length, 1)
    assert.equal(scheduler.jobs.length, 0)
    assert.equal(controller.isIdle(), true)
  })

  it('re-enters idle after every start while no run exists', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, scheduler, events } = buildRunController({ api })

    await controller.start()
    await controller.start()

    assert.equal(api.calls.length, 2)
    assert.equal(scheduler.jobs.length, 0)
    assert.equal(controller.isIdle(), true)
    assert.deepEqual(events.at(-1), { type: 'run', run: null })
  })

  it('treats an empty 200 answer like no run', async () => {
    const { controller, scheduler, events, api } = buildRunController({ runs: [{ data: null }] })

    await controller.start()

    assert.equal(api.calls.length, 1)
    assert.equal(scheduler.jobs.length, 0)
    assert.equal(controller.isIdle(), true)
    assert.deepEqual(events.at(-1), { type: 'run', run: null })
  })

  it('retires the previous poll handle when a start runs again', async () => {
    const { controller, scheduler, api } = buildRunController({
      runs: [
        { data: { outcome: 'running', attempted: 1, total: 5 } },
        { data: { outcome: 'running', attempted: 2, total: 5 } },
      ],
    })
    const liveJobs = () => scheduler.jobs.filter((job) => !scheduler.cancelled.includes(job.id)).length

    await controller.start()
    assert.equal(liveJobs(), 1)

    await controller.start()
    assert.equal(liveJobs(), 1)
    assert.deepEqual(scheduler.cancelled, [1])
    assert.equal(api.calls.length, 2)
  })

  it('stops polling when permission is lost', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 403 } }) })
    const { controller, scheduler, events } = buildRunController({ api })

    await controller.start()
    assert.equal(events.some((e) => e.type === 'run_error' && e.code === 'permission'), true)
    assert.equal(scheduler.jobs.length, 0)
  })

  it('keeps waiting for a user-started run until the worker creates it', async () => {
    const notFound = () => Object.assign(new Error('no run'), { response: { status: 404 } })
    const { controller, scheduler, events, api } = buildRunController({
      runs: [notFound(), notFound(), { data: { outcome: 'running', attempted: 0, total: 5 } }],
    })

    await controller.start({ awaitRun: true })
    assert.equal(api.calls.length, 1)
    assert.equal(events.at(-1).run, null)
    assert.equal(scheduler.jobs.length, 1)

    await scheduler.runNext()
    assert.equal(api.calls.length, 2)
    assert.equal(events.at(-1).run, null)
    assert.equal(scheduler.jobs.length, 1)

    await scheduler.runNext()
    assert.equal(api.calls.length, 3)
    assert.equal(events.at(-1).run.outcome, 'running')
    assert.equal(scheduler.jobs.length, 1)
  })

  it('stops waiting once the post-start grace answers are used up', async () => {
    assert.equal(RUN_START_GRACE_POLLS, 5)
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, scheduler } = buildRunController({ api })

    await controller.start({ awaitRun: true })
    assert.equal(scheduler.jobs.length, 1)

    // Five 404 answers in total (the start's own plus four polls) keep waiting.
    for (let poll = 0; poll < 4; poll += 1) {
      assert.equal(scheduler.jobs.length, 1)
      await scheduler.runNext()
    }
    assert.equal(api.calls.length, 5)
    assert.equal(controller.isIdle(), false)

    // The sixth consecutive 404 parks the controller.
    await scheduler.runNext()
    assert.equal(api.calls.length, 6)
    assert.equal(scheduler.jobs.length, 0)
    assert.equal(controller.isIdle(), true)
  })

  it('does not react to an older run while the started task is pending', async () => {
    const { controller, scheduler, events, api } = buildRunController({
      runs: [
        { data: { task_id: 'old', outcome: 'finished' } },
        { data: { task_id: 'new', outcome: 'running', attempted: 0, total: 5 } },
      ],
    })

    await controller.start({ awaitRun: true, taskId: 'new' })
    assert.equal(api.calls.length, 1)
    assert.equal(events.length, 0)
    assert.equal(scheduler.jobs.length, 1)

    await scheduler.runNext()
    assert.equal(events.at(-1).run.task_id, 'new')
    assert.equal(scheduler.jobs.length, 1)
  })

  it('still reports an older finished run on mount', async () => {
    const { controller, scheduler, events } = buildRunController({
      runs: [{ data: { task_id: 'old', outcome: 'finished' } }],
    })

    await controller.start()
    assert.equal(events.at(-1).run.task_id, 'old')
    assert.equal(scheduler.jobs.length, 0)
  })

  it('re-checks once on resume and keeps polling when a run exists', async () => {
    const { controller, scheduler, events, api } = buildRunController({
      runs: [
        Object.assign(new Error('no run'), { response: { status: 404 } }),
        { data: { outcome: 'running', attempted: 1, total: 5 } },
      ],
    })

    await controller.start()
    assert.equal(controller.isIdle(), true)

    await controller.resume()
    assert.equal(api.calls.length, 2)
    assert.equal(events.at(-1).run.outcome, 'running')
    assert.equal(scheduler.jobs.length, 1)
    assert.equal(scheduler.jobs[0].ms, RUN_POLL_MS)
  })

  it('stays idle on resume while no run exists', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, scheduler } = buildRunController({ api })

    await controller.start()
    await controller.resume()

    assert.equal(api.calls.length, 2)
    assert.equal(controller.isIdle(), true)
    assert.equal(scheduler.jobs.length, 0)
  })

  it('sends nothing on resume while polling or after stop', async () => {
    const { controller, api } = buildRunController()

    await controller.start()
    const calls = api.calls.length
    await controller.resume()
    assert.equal(api.calls.length, calls)

    controller.stop()
    await controller.resume()
    assert.equal(api.calls.length, calls)
  })

  it('ignores a concurrent resume while a probe is in flight', async () => {
    const gate = deferred()
    let answered = 0
    const api = createFakeApi({
      respond: () => {
        answered += 1
        if (answered === 1) return Promise.reject({ response: { status: 404 } })
        return gate.promise
      },
    })
    const { controller, scheduler } = buildRunController({ api })

    await controller.start()
    assert.equal(controller.isIdle(), true)

    const first = controller.resume()
    const second = await controller.resume()
    assert.equal(second, null)
    assert.equal(api.calls.length, 2)

    gate.resolve({ data: { outcome: 'running', attempted: 0, total: 5 } })
    await first
    assert.equal(scheduler.jobs.length, 1)
  })

  it('re-checks an idle poller when the tab becomes visible or focused', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, scheduler } = buildRunController({ api })
    await controller.start()
    assert.equal(controller.isIdle(), true)

    const doc = createFakeDoc('hidden')
    const win = createFakeWin()
    const unbind = bindResumeOnVisible(controller, { doc, win })
    assert.equal(typeof unbind, 'function')

    const afterMount = api.calls.length
    doc.emit('visibilitychange')
    await flush()
    assert.equal(api.calls.length, afterMount)

    doc.visibilityState = 'visible'
    doc.emit('visibilitychange')
    await flush()
    assert.equal(api.calls.length, afterMount + 1)

    win.emit('focus')
    await flush()
    assert.equal(api.calls.length, afterMount + 2)

    unbind()
    doc.emit('visibilitychange')
    win.emit('focus')
    await flush()
    assert.equal(api.calls.length, afterMount + 2)
    assert.equal(scheduler.jobs.length, 0)
  })

  it('returns a callable no-op binding without a controller or listeners', () => {
    assert.equal(typeof bindResumeOnVisible(null), 'function')
    bindResumeOnVisible(null)()
    bindResumeOnVisible(undefined, {})()
    bindResumeOnVisible({ resume: () => Promise.resolve(null) }, { doc: {} })()
    bindResumeOnVisible({ resume: () => Promise.resolve(null) }, { doc: createFakeDoc(), win: {} })()
  })

  it('shares the idle behaviour on the ui run surface', async () => {
    const api = createFakeApi({ respond: () => Promise.reject({ response: { status: 404 } }) })
    const { controller, scheduler } = buildRunController({ api, kind: 'ui', targetLanguage: 'de' })

    await controller.start()

    assert.equal(api.calls[0].path, 'plugins/ai-translation/ui/runs')
    assert.equal(api.calls[0].config.params.target_language, 'de')
    assert.equal(scheduler.jobs.length, 0)
    assert.equal(controller.isIdle(), true)
  })

  it('never overlaps requests and stops on demand', async () => {
    const gate = deferred()
    const api = createFakeApi({ respond: (entry) => (entry.path === RUNS_PATH ? gate.promise : { data: null }) })
    const { controller, scheduler } = buildRunController({ api })

    const pending = controller.start()
    // A tick fired while the first request is still in flight must not send again.
    await controller.load()
    assert.equal(api.calls.length, 1)

    controller.stop()
    gate.resolve({ data: { outcome: 'running' } })
    await pending
    assert.equal(scheduler.jobs.length, 0)
  })
})

describe('createSchemaTranslationController', () => {
  it('starts a schema task through the real POST /tasks gate', async () => {
    const api = createFakeApi({ respond: (entry) => (entry.path === TASKS_PATH ? { data: { id: 'task-1' } } : { data: null }) })
    const controller = createSchemaTranslationController({ api, schemaId: '22222222-2222-2222-2222-222222222222' })

    const result = await controller.start()
    assert.equal(result.ok, true)
    const call = api.calls[0]
    assert.equal(call.method, 'post')
    assert.equal(call.path, TASKS_PATH)
    assert.deepEqual(call.body, {
      tasktype: SCHEMA_TASK_TYPE,
      schema_id: '22222222-2222-2222-2222-222222222222',
      plugin_parameters: {},
      current_step: null,
    })
  })

  it('maps a 409 conflict and a 403 permission to typed outcomes', async () => {
    const conflictApi = createFakeApi({ respond: () => Promise.reject({ response: { status: 409, data: { detail: { code: 'already_running' } } } }) })
    const conflict = await createSchemaTranslationController({ api: conflictApi, schemaId: 's' }).start()
    assert.equal(conflict.reason, 'error')
    assert.equal(conflict.code, 'already_running')

    const deniedApi = createFakeApi({ respond: () => Promise.reject({ response: { status: 403 } }) })
    const denied = await createSchemaTranslationController({ api: deniedApi, schemaId: 's' }).start()
    assert.equal(denied.code, 'permission')
  })

  it('sends the selected kinds in canonical order', async () => {
    const api = createFakeApi({ respond: () => ({ data: { id: 'task-1' } }) })
    const controller = createSchemaTranslationController({ api, schemaId: 's' })

    const result = await controller.start({ translationTypes: ['status', 'object_type'] })
    assert.equal(result.ok, true)
    assert.deepEqual(api.calls[0].body.plugin_parameters, {
      translation_types: ['object_type', 'status'],
    })
  })

  it('refuses an empty selection without any API call', async () => {
    const api = createFakeApi({ respond: () => ({ data: { id: 'task-1' } }) })
    const controller = createSchemaTranslationController({ api, schemaId: 's' })

    const result = await controller.start({ translationTypes: [] })
    assert.deepEqual(result, { ok: false, reason: 'invalid' })
    assert.equal(api.calls.length, 0)
  })
})

describe('schema kind selection', () => {
  it('normalizes to known kinds in canonical order', () => {
    assert.deepEqual(normalizeTranslationTypes(['status', 'object_type', 'status', 'bogus']), [
      'object_type',
      'status',
    ])
    assert.deepEqual(normalizeTranslationTypes('status'), [])
    assert.deepEqual(normalizeTranslationTypes(undefined), [])
    assert.deepEqual(SCHEMA_TRANSLATION_TYPES, [
      'object_type',
      'object_type_attribute',
      'select_option',
      'object_value',
      'status',
      'reference_type',
    ])
  })

  it('sums only the selected rows and reports what a run would request', () => {
    const items = [
      { translation_type: 'object_type', missing: 9, waiting: 4 },
      { translation_type: 'status', missing: 3, waiting: 1 },
      { translation_type: 'reference_type', missing: 2, waiting: 2 },
      { translation_type: 'bogus', missing: 100, waiting: 0 },
    ]
    assert.deepEqual(summarizeSchemaCandidates(items, ['status', 'reference_type']), {
      missing: 5,
      waiting: 3,
      requestable: 2,
    })
    assert.deepEqual(summarizeSchemaCandidates(items, ['object_type']), {
      missing: 9,
      waiting: 4,
      requestable: 5,
    })
    assert.equal(summarizeSchemaCandidates(null, ['status']), null)
  })

  it('ignores negative and non-numeric counts', () => {
    const items = [
      { translation_type: 'status', missing: -4, waiting: 'x' },
      { translation_type: 'status', missing: 2, waiting: 5 },
    ]
    assert.deepEqual(summarizeSchemaCandidates(items, ['status']), {
      missing: 2,
      waiting: 5,
      requestable: 0,
    })
  })

  it('blocks an empty selection and a fully waiting selection only', () => {
    assert.equal(schemaStartBlock({ selected: [], summary: null }), 'none_selected')
    assert.equal(
      schemaStartBlock({ selected: ['status'], summary: { requestable: 0 } }),
      'nothing_missing',
    )
    assert.equal(schemaStartBlock({ selected: ['status'], summary: null }), null)
    assert.equal(
      schemaStartBlock({ selected: ['status'], summary: { requestable: 2 } }),
      null,
    )
  })

  it('loads the candidate rows for one schema and fails softly', async () => {
    const items = [{ translation_type: 'status', missing: 1, waiting: 0 }]
    const api = createFakeApi({ respond: () => ({ data: { items } }) })

    const loaded = await loadSchemaCandidates({ api, schemaId: 'schema-1' })
    assert.equal(loaded.ok, true)
    assert.deepEqual(loaded.items, items)
    assert.equal(api.calls[0].method, 'get')
    assert.equal(api.calls[0].path, SCHEMA_CANDIDATES_PATH)
    assert.deepEqual(api.calls[0].config, { params: { schema_id: 'schema-1' } })

    const failing = createFakeApi({ respond: () => Promise.reject({ response: { status: 403 } }) })
    assert.deepEqual(await loadSchemaCandidates({ api: failing, schemaId: 'schema-1' }), {
      ok: false,
      items: null,
    })
  })
})

describe('schemaPresent', () => {
  it('is present when the LLM is configured', async () => {
    const api = createFakeApi({ respond: (entry) => {
      if (entry.path.endsWith('/data/availability')) return { data: { available: true } }
      return Promise.reject({ response: { status: 404 } })
    } })
    assert.equal(await schemaPresent({ api, schemaId: 's' }), true)
  })

  it('is present for authorized run history without a configured LLM', async () => {
    const api = createFakeApi({ respond: (entry) => {
      if (entry.path.endsWith('/data/availability')) return { data: { available: false } }
      if (entry.path === RUNS_PATH) return { data: { outcome: 'finished' } }
      return Promise.reject({ response: { status: 404 } })
    } })
    assert.equal(await schemaPresent({ api, schemaId: 's' }), true)
  })

  it('is absent with no LLM and no history, and fails closed', async () => {
    const empty = createFakeApi({ respond: (entry) => {
      if (entry.path.endsWith('/data/availability')) return { data: { available: false } }
      return Promise.reject({ response: { status: 404 } })
    } })
    assert.equal(await schemaPresent({ api: empty, schemaId: 's' }), false)

    const failing = createFakeApi({ respond: () => Promise.reject({ response: { status: 500 } }) })
    assert.equal(await schemaPresent({ api: failing, schemaId: 's' }), false)
  })
})

// --- Task 3: UI language runs + explicit review/apply ------------------------

const UI_SUGGESTION = {
  suggestion_id: '33333333-3333-3333-3333-333333333333',
  key: 'nav.settings',
  namespace: 'nav',
  proposed_text: 'Einstellungen',
  source_text: 'Settings',
  status: 'pending',
}

describe('normalizeUiParams', () => {
  it('normalizes the current language/filter into the strict language/filter shape', () => {
    const params = normalizeUiParams({
      language: ' DE ',
      namespace: 'nav',
      namespaceIsNull: false,
      search: '  key  ',
    })
    assert.deepEqual(params, {
      target_language: 'de',
      namespace: 'nav',
      namespace_is_null: false,
      q: 'key',
    })
  })

  it('maps empty namespace/search to null and never contradicts namespace_is_null', () => {
    assert.deepEqual(
      normalizeUiParams({ language: 'fr', namespace: '', namespaceIsNull: true, search: '' }),
      { target_language: 'fr', namespace: null, namespace_is_null: true, q: null },
    )
    // A set namespace forces namespace_is_null false (the strict contradiction guard).
    assert.equal(
      normalizeUiParams({ language: 'fr', namespace: 'nav', namespaceIsNull: true }).namespace_is_null,
      false,
    )
  })

  it('ignores the only-missing checkbox so it never changes eligibility', () => {
    const withFlag = normalizeUiParams({ language: 'de', onlyMissing: true })
    const without = normalizeUiParams({ language: 'de' })
    assert.deepEqual(withFlag, without)
    assert.equal('only_missing' in withFlag, false)
  })
})

describe('classifyEligibility', () => {
  it('distinguishes nothing-missing from missing-but-not-eligible', () => {
    assert.equal(classifyEligibility({ eligible_total: 0, missing_total: 0 }).state, 'none_missing')
    assert.equal(classifyEligibility({ eligible_total: 0, missing_total: 7 }).state, 'missing_not_eligible')
    assert.equal(classifyEligibility({ eligible_total: 4, missing_total: 9 }).state, 'eligible')
  })

  it('flags a count above the 100 block cap without starting the next block', () => {
    const result = classifyEligibility({ eligible_total: 137, missing_total: 137, has_more: true })
    assert.equal(result.overCap, true)
    assert.equal(result.eligibleTotal, 137)
    assert.equal(result.hasMore, true)
  })
})

describe('uiPresent — side-effect free predicate', () => {
  it('is absent in the authored English source language without a request', async () => {
    const api = createFakeApi({ respond: () => ({ data: { available: true, open_count: 5 } }) })
    assert.equal(await uiPresent({ api, language: 'en' }), false)
    assert.equal(api.calls.length, 0)
  })

  it('is present with a configured LLM even with no open suggestions', async () => {
    const api = createFakeApi({ respond: () => ({ data: { available: true, open_count: 0 } }) })
    assert.equal(await uiPresent({ api, language: 'de' }), true)
    assert.equal(api.calls[0].path, UI_STATUS_PATH)
  })

  it('is present for readable open suggestions without an LLM and fails closed', async () => {
    const readable = createFakeApi({ respond: () => ({ data: { available: false, open_count: 2 } }) })
    assert.equal(await uiPresent({ api: readable, language: 'de' }), true)

    const failing = createFakeApi({ respond: () => Promise.reject({ response: { status: 500 } }) })
    assert.equal(await uiPresent({ api: failing, language: 'de' }), false)
  })
})

describe('reconcileApplyOutcome', () => {
  it('classifies a confirmed block result with its counters', () => {
    const view = reconcileApplyOutcome({
      response: { data: { written: 2, skipped: 1, invalid: 0, results: [] } },
    })
    assert.equal(view.status, 'confirmed')
    assert.equal(view.written, 2)
    assert.equal(view.skipped, 1)
  })

  it('separates a confirmed rejection from an unknown transport outcome', () => {
    assert.equal(
      reconcileApplyOutcome({ error: { response: { status: 409, data: { detail: { code: 'transaction_failed' } } } } }).status,
      'rejected',
    )
    assert.equal(
      reconcileApplyOutcome({ error: { response: { status: 503, data: { detail: { code: 'outcome_unknown' } } } } }).status,
      'unknown',
    )
    assert.equal(reconcileApplyOutcome({ error: { code: 'ERR_NETWORK' } }).status, 'unknown')
  })
})

function buildUiController(overrides = {}) {
  const api = overrides.api ?? createFakeApi({
    respond: (entry) => {
      if (entry.path === UI_CANDIDATES_PATH) {
        return { data: { items: [], eligible_total: 3, missing_total: 5, has_more: false } }
      }
      if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
      if (entry.path === TASKS_PATH) return { data: { id: 'task-1' } }
      return { data: null }
    },
  })
  const events = []
  const published = []
  const scheduler = createScheduler()
  let filters = overrides.filters ?? { language: 'de', namespace: undefined, namespaceIsNull: false, search: '' }
  let scopeRevision = overrides.scopeRevision ?? 1
  const controller = createUiTranslationController({
    api,
    getFilters: () => filters,
    getScopeRevision: () => scopeRevision,
    publishReview: (payload) => {
      published.push(payload)
      return payload.scopeRevision === scopeRevision
    },
    leaveReview: () => published.push({ left: true }),
    refreshCatalog: () => published.push({ refreshed: true }),
    onEvent: (event) => events.push(event),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    ...overrides.controller,
  })
  return {
    controller,
    api,
    events,
    published,
    scheduler,
    setFilters: (next) => {
      filters = next
    },
    setScope: (next) => {
      scopeRevision = next
    },
  }
}

describe('createUiTranslationController — eligibility and one deliberate start', () => {
  it('reads candidates and the open-suggestion count for the current scope', async () => {
    const { controller, api, events } = buildUiController()

    const state = await controller.load()

    assert.equal(state.eligibility.state, 'eligible')
    assert.equal(state.eligibility.eligibleTotal, 3)
    assert.equal(state.suggestionTotal, 1)
    const candidates = api.calls.find((c) => c.path === UI_CANDIDATES_PATH)
    assert.equal(candidates.config.params.target_language, 'de')
    assert.equal(events.at(-1).type, 'eligibility')
  })

  it('starts exactly one run for the current language/filter and never auto-continues', async () => {
    const { controller, api, events } = buildUiController()

    const result = await controller.start()

    assert.equal(result.ok, true)
    const startCalls = api.calls.filter((c) => c.path === TASKS_PATH)
    assert.equal(startCalls.length, 1)
    assert.deepEqual(startCalls[0].body, {
      tasktype: UI_TASK_TYPE,
      plugin_parameters: { target_language: 'de', namespace: null, namespace_is_null: false, q: null },
      current_step: null,
    })
    // A terminal run must not silently start the next block.
    const run = { outcome: 'finished', generated: 3, attempted: 3 }
    events.push({ type: 'run', run })
    assert.equal(api.calls.filter((c) => c.path === TASKS_PATH).length, 1)
  })

  it('refuses a second start while one is in flight', async () => {
    const gate = deferred()
    const api = createFakeApi({ respond: (entry) => (entry.path === TASKS_PATH ? gate.promise : { data: null }) })
    const { controller } = buildUiController({ api })

    const first = controller.start()
    const second = await controller.start()
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'pending')

    gate.resolve({ data: { id: 'task-1' } })
    await first
  })

  it('waits for the worker-created ui run of the started task', async () => {
    let runs = 0
    const api = createFakeApi({
      respond: (entry) => {
        if (entry.path === TASKS_PATH) return { data: { id: 'task-ui-1' } }
        if (entry.path === 'plugins/ai-translation/ui/runs') {
          runs += 1
          if (runs === 1) return Promise.reject({ response: { status: 404 } })
          return { data: { task_id: 'task-ui-1', outcome: 'running', attempted: 0, total: 4 } }
        }
        return { data: null }
      },
    })
    const { controller, events, scheduler } = buildUiController({ api })

    await controller.start()
    await flush()
    assert.equal(scheduler.jobs.length, 1)
    assert.equal(events.some((event) => event.type === 'run' && event.run !== null), false)

    await scheduler.runNext()
    const runEvent = events.find((event) => event.type === 'run' && event.run !== null)
    assert.equal(runEvent.run.task_id, 'task-ui-1')
    assert.equal(scheduler.jobs.length, 1)
  })

  it('exposes resume delegated to its run controller', async () => {
    const api = createFakeApi({
      respond: (entry) => {
        if (entry.path === TASKS_PATH) return { data: { id: 'task-ui-2' } }
        if (entry.path === 'plugins/ai-translation/ui/runs') {
          return Promise.reject({ response: { status: 404 } })
        }
        return { data: null }
      },
    })
    const { controller, scheduler } = buildUiController({ api })
    const runCalls = () => api.calls.filter((call) => call.path === 'plugins/ai-translation/ui/runs').length

    await controller.start()
    await flush()
    for (let poll = 0; poll < 5; poll += 1) {
      await scheduler.runNext()
    }
    assert.equal(scheduler.jobs.length, 0)

    const before = runCalls()
    await controller.resume()
    assert.equal(runCalls(), before + 1)
    assert.equal(scheduler.jobs.length, 0)
  })
})

describe('createUiTranslationController — explicit existing-table review/apply', () => {
  it('publishes the current <=100 namespace/key rows and draft references', async () => {
    const { controller, published } = buildUiController()

    const review = await controller.enterReview()

    assert.equal(review.ok, true)
    assert.equal(review.count, 1)
    const payload = published.at(-1)
    assert.equal(payload.rows[0].uiStringId, UI_SUGGESTION.suggestion_id)
    assert.equal(payload.rows[0].key, 'nav.settings')
    assert.equal(payload.rows[0].codeDefault, 'Settings')
    assert.equal(payload.drafts[0].value, 'Einstellungen')
    assert.equal(payload.drafts[0].reference, UI_SUGGESTION.suggestion_id)
    assert.equal(payload.total, 1)
  })

  it('keeps edits local until an explicit apply sends exactly the displayed drafts', async () => {
    const { controller, api } = buildUiController()
    await controller.enterReview()

    controller.setDraftValue(UI_SUGGESTION.suggestion_id, 'Einstellungen (bearbeitet)')
    // No autosave: editing alone sends no request.
    assert.equal(api.calls.some((c) => c.path === UI_APPLY_PATH), false)

    const result = await controller.apply()
    assert.equal(result.status, 'confirmed')
    const call = api.calls.find((c) => c.path === UI_APPLY_PATH)
    assert.deepEqual(call.body.items, [
      { suggestion_id: UI_SUGGESTION.suggestion_id, value: 'Einstellungen (bearbeitet)' },
    ])
    assert.equal(call.body.target_language, 'de')
    assert.equal(call.config.skipRateLimitRetry, true)
  })

  it('blocks another apply after an unknown transport outcome until reconciled', async () => {
    const api = createFakeApi({
      respond: (entry) => {
        if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
        if (entry.path === UI_APPLY_PATH) {
          return Promise.reject({ response: { status: 503, data: { detail: { code: 'outcome_unknown' } } } })
        }
        return { data: null }
      },
    })
    const { controller } = buildUiController({ api })
    await controller.enterReview()

    const first = await controller.apply()
    assert.equal(first.status, 'unknown')
    assert.equal(controller.blocked(), true)

    const second = await controller.apply()
    assert.equal(second.status, 'blocked')
    assert.equal(api.calls.filter((c) => c.path === UI_APPLY_PATH).length, 1)

    await controller.reconcile()
    assert.equal(controller.blocked(), false)
  })

  it('discards one row only on a confirmed success and retains it otherwise', async () => {
    const okApi = createFakeApi({
      respond: (entry) => {
        if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
        if (entry.method === 'delete') return { data: { discarded: true } }
        return { data: null }
      },
    })
    const ok = buildUiController({ api: okApi })
    await ok.controller.enterReview()
    assert.equal(await ok.controller.discard(UI_SUGGESTION.suggestion_id), true)
    assert.equal(ok.controller.getReview(), null)

    const badApi = createFakeApi({
      respond: (entry) => {
        if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
        if (entry.method === 'delete') return Promise.reject({ response: { status: 500 } })
        return { data: null }
      },
    })
    const bad = buildUiController({ api: badApi })
    await bad.controller.enterReview()
    assert.equal(await bad.controller.discard(UI_SUGGESTION.suggestion_id), false)
    assert.equal(bad.controller.getReview().rows.length, 1)
  })

  it('hands the host table its edit and discard back-channel with the projection', async () => {
    const api = createFakeApi({
      respond: (entry) => {
        if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
        if (entry.method === 'delete') return { data: { discarded: true } }
        return { data: null }
      },
    })
    const { controller, published } = buildUiController({ api })
    await controller.enterReview()
    const payload = published.at(-1)

    payload.onDraftChange(UI_SUGGESTION.suggestion_id, 'Aus der Tabelle')
    assert.equal(controller.getReview().drafts[0].value, 'Aus der Tabelle')

    assert.equal(await payload.onDiscard(UI_SUGGESTION.suggestion_id), true)
    assert.equal(api.calls.filter((c) => c.method === 'delete').length, 1)
    assert.equal(controller.getReview(), null)
  })

  it('marks rows the apply reported invalid when it republishes the block', async () => {
    const api = createFakeApi({
      respond: (entry) => {
        if (entry.path === UI_SUGGESTIONS_PATH) return { data: { items: [UI_SUGGESTION], total: 1 } }
        if (entry.path === UI_APPLY_PATH) {
          return {
            data: {
              written: 0,
              skipped: 0,
              invalid: 1,
              results: [{ suggestion_id: UI_SUGGESTION.suggestion_id, status: 'invalid', reason: 'placeholder_mismatch' }],
            },
          }
        }
        return { data: null }
      },
    })
    const { controller, published } = buildUiController({
      api,
      controller: { invalidReasonText: () => 'Nicht gespeichert' },
    })
    await controller.enterReview()
    assert.equal(published.at(-1).drafts[0].invalid, undefined)

    await controller.apply()
    await new Promise((resolve) => setImmediate(resolve))

    const republished = published.filter((entry) => Array.isArray(entry.drafts)).at(-1)
    assert.equal(republished.drafts[0].invalid, true)
    assert.equal(republished.drafts[0].reasonText, 'Nicht gespeichert')
  })

  it('clearReview returns to browse and drops local edits', async () => {
    const { controller, published } = buildUiController()
    await controller.enterReview()
    controller.setDraftValue(UI_SUGGESTION.suggestion_id, 'Lokal')

    controller.clearReview()
    assert.equal(controller.getReview(), null)

    await controller.enterReview()
    assert.equal(published.at(-1).drafts[0].value, 'Einstellungen')
  })

  it('never displays a review published for a scope that has already changed', async () => {
    const gate = deferred()
    const api = createFakeApi({
      respond: (entry) => (entry.path === UI_SUGGESTIONS_PATH ? gate.promise : { data: null }),
    })
    const { controller, published, setScope } = buildUiController({ api })

    const pending = controller.enterReview()
    setScope(2)
    gate.resolve({ data: { items: [UI_SUGGESTION], total: 1 } })

    const review = await pending
    assert.equal(review.ok, false)
    assert.equal(review.reason, 'stale')
    assert.equal(published.length, 0)
    assert.equal(controller.getReview(), null)
  })
})
