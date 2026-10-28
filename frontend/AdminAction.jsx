// Phase 307 (AITR-03, S3/S4): the ai-translation UI-language admin action.
//
// It renders in the existing translation admin action row, directly after the
// filter bar. Browse view shows the eligible count and one deliberate start plus
// the "Review N suggestions" entry; review view narrows the existing catalog
// table (the host projects the rows) and offers the one explicit Apply. It never
// navigates, never reveals a second step, never auto-continues to the next block
// and never replays an uncertain write. All copy is plugin-owned.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  LucideIcon,
  api,
  injectPluginStyles,
  interpolateDefault,
  usePluginTranslation,
} from '@indramesh/plugin-api'

import RunStatus from './RunStatus.jsx'
import styles from './admin.css?inline'
import {
  ERROR_COPY,
  createUiTranslationController,
  isTerminalOutcome,
  retryAllowed,
} from './translation-state.js'

const PLUGIN_NAME = 'ai-translation'

function stylesWereRefused() {
  if (typeof document === 'undefined') return false
  const element = document.querySelector(
    'style[data-plugin-owner="ai-translation"][data-plugin-style="admin"]',
  )
  return !!element && element.sheet === null
}

export default function AdminAction({
  filters,
  scopeRevision,
  canWrite,
  publishReview,
  leaveReview,
  refreshCatalog,
}) {
  const { t } = usePluginTranslation(PLUGIN_NAME)
  const language = filters?.language ?? 'en'

  const [eligibility, setEligibility] = useState(null)
  const [suggestionTotal, setSuggestionTotal] = useState(0)
  const [run, setRun] = useState(null)
  const [review, setReview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | starting | conflict | error
  const [errorCode, setErrorCode] = useState(null)
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyOutcome, setApplyOutcome] = useState(null)
  const [applyBlocked, setApplyBlocked] = useState(false)
  const [stylesRefused, setStylesRefused] = useState(false)

  const mountedRef = useRef(true)
  const errorTitleRef = useRef(null)
  const resultRef = useRef(null)
  const reviewHeaderRef = useRef(null)

  // Keep the latest scope values and host seams available to the controller's
  // lazy getters without recreating it on every render: a scope change hands
  // in a fresh host review session.
  const filtersRef = useRef(filters)
  const scopeRevisionRef = useRef(scopeRevision)
  const hostRef = useRef(null)
  const tRef = useRef(t)
  const onEventRef = useRef(null)
  filtersRef.current = filters
  scopeRevisionRef.current = scopeRevision
  hostRef.current = { publishReview, leaveReview, refreshCatalog }
  tRef.current = t

  const controllerRef = useRef(null)
  if (controllerRef.current === null) {
    controllerRef.current = createUiTranslationController({
      api,
      getFilters: () => filtersRef.current,
      getScopeRevision: () => scopeRevisionRef.current,
      publishReview: (payload) => hostRef.current.publishReview?.(payload) ?? false,
      leaveReview: () => hostRef.current.leaveReview?.(),
      refreshCatalog: () => hostRef.current.refreshCatalog?.(),
      invalidReasonText: () =>
        tRef.current('admin.row_invalid', 'This suggestion was not saved. Edit or discard it.'),
      onEvent: (event) => onEventRef.current?.(event),
    })
  }
  const controller = controllerRef.current

  onEventRef.current = (event) => {
    if (!mountedRef.current) return
    switch (event.type) {
      case 'eligibility':
        setEligibility(event.eligibility)
        setSuggestionTotal(event.suggestionTotal)
        break
      case 'run':
        setRun(event.run)
        break
      case 'run_error':
        setRun(null)
        break
      case 'started':
        setStatus('idle')
        break
      case 'start_error':
        setStatus(event.code === 'already_running' ? 'conflict' : 'error')
        setErrorCode(event.code)
        break
      case 'review':
        setReview(controller.getReview())
        setApplyOutcome(null)
        if (event.focus) reviewHeaderRef.current?.focus()
        break
      case 'review_empty':
        setReview(null)
        break
      case 'applied':
        setReview(controller.getReview())
        setApplyOutcome({ written: event.written, skipped: event.skipped, invalid: event.invalid })
        resultRef.current?.focus()
        break
      case 'apply_rejected':
        setApplyOutcome({ rejected: true })
        resultRef.current?.focus()
        break
      case 'apply_unknown':
        setApplyBlocked(true)
        setApplyOutcome({ unknown: true })
        resultRef.current?.focus()
        break
      case 'apply_error':
        setStatus('error')
        setErrorCode(event.code ?? 'unexpected')
        break
      case 'discarded':
        setReview(controller.getReview())
        break
      default:
        break
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const handle = injectPluginStyles(PLUGIN_NAME, 'admin', styles)
    if (!handle?.ok || stylesWereRefused()) setStylesRefused(true)
    return () => handle?.release?.()
  }, [])

  // Load the current-scope eligibility block and the filter-wide open count on
  // mount and whenever the scope changes. Both are silent and fail closed.
  useEffect(() => {
    controller.clearReview()
    setReview(null)
    setApplyOutcome(null)
    if (language === 'en') return undefined
    void controller.load()
    return undefined
  }, [controller, language, scopeRevision])

  useEffect(() => {
    return () => controller.stop()
  }, [controller])

  useEffect(() => {
    if (status === 'error') errorTitleRef.current?.focus()
  }, [status])

  const handleStart = useCallback(async () => {
    if (status === 'starting') return
    setStatus('starting')
    setErrorCode(null)
    const result = await controller.start()
    if (!mountedRef.current) return
    if (result.ok) {
      setStatus('idle')
      void controller.load()
      return
    }
    if (result.reason === 'pending' || result.reason === 'ignored') {
      setStatus('idle')
      return
    }
    setStatus(result.code === 'already_running' ? 'conflict' : 'error')
    setErrorCode(result.code ?? 'unexpected')
  }, [controller, status])

  const handleReview = useCallback(async () => {
    const result = await controller.enterReview({ focus: true })
    if (!mountedRef.current) return
    if (result.ok && result.count > 0) {
      setReview(controller.getReview())
      setApplyOutcome(null)
      reviewHeaderRef.current?.focus()
    }
  }, [controller])

  const handleApply = useCallback(async () => {
    setApplyBusy(true)
    const outcome = await controller.apply()
    if (!mountedRef.current) return
    setApplyBusy(false)
    if (outcome.status === 'confirmed') {
      setReview(controller.getReview())
      setApplyOutcome({ written: outcome.written, skipped: outcome.skipped, invalid: outcome.invalid, results: outcome.results })
      resultRef.current?.focus()
    } else if (outcome.status === 'unknown') {
      setApplyBlocked(true)
      setApplyOutcome({ unknown: true })
      resultRef.current?.focus()
    } else if (outcome.status === 'rejected') {
      setApplyOutcome({ rejected: true })
      resultRef.current?.focus()
    }
  }, [controller])

  const handleReconcile = useCallback(async () => {
    await controller.reconcile()
    if (!mountedRef.current) return
    setApplyBlocked(false)
    setApplyOutcome(null)
    setReview(controller.getReview())
  }, [controller])

  if (language === 'en') return null

  if (stylesRefused) {
    return (
      <div className="aitr-admin" data-testid="plugin-ai-translation-admin">
        <div className="aitr-styles-refused" role="alert" data-testid="plugin-ai-translation-admin-styles-refused">
          {t('styles.refused', 'The AI translation action could not be styled, so it is not shown. Manual translation still works.')}
        </div>
      </div>
    )
  }

  const running = run !== null && !isTerminalOutcome(run.outcome)
  const busy = status === 'starting'
  const errorCopy = errorCode ? ERROR_COPY[errorCode] : null
  const inReview = !!review && review.rows.length > 0

  if (inReview) {
    const shown = review.rows.length
    const total = review.total ?? shown
    const skippedKeys = (applyOutcome?.results ?? [])
      .filter((row) => row.status === 'skipped')
      .map((row) => review.rows.find((entry) => entry.uiStringId === String(row.suggestion_id))?.key ?? String(row.suggestion_id))

    return (
      <div className="aitr-admin aitr-admin-review" data-testid="plugin-ai-translation-admin">
        <p
          ref={reviewHeaderRef}
          tabIndex={-1}
          className="aitr-review-heading"
          data-testid="plugin-ai-translation-review-heading"
        >
          {shown === 1
            ? interpolateDefault(t('admin.review.heading.one', '{{count}} suggestion to review for {{language}}'), { count: shown, language })
            : interpolateDefault(t('admin.review.heading.other', '{{count}} suggestions to review for {{language}}'), { count: shown, language })}
        </p>

        {total > shown && (
          <p className="aitr-review-note" data-testid="plugin-ai-translation-review-showing">
            {interpolateDefault(
              t('admin.review.showing', 'Showing {{shown}} of {{total}} suggestions. Apply or discard these to see the rest.'),
              { shown, total },
            )}
          </p>
        )}

        {!canWrite && (
          <p className="aitr-review-notice" role="note" data-testid="plugin-ai-translation-review-readonly">
            {t('admin.review.readonly', 'You can review these suggestions. Saving or discarding them requires permission to edit translations.')}
          </p>
        )}
        {canWrite && (
          <p className="aitr-review-note">{t('admin.review.discard_help', 'Discarded suggestions are not proposed again.')}</p>
        )}

        {canWrite && (
          <div className="aitr-review-actions">
            <Button
              type="button"
              size="sm"
              className="h-auto min-h-8 whitespace-normal font-semibold"
              data-testid="plugin-ai-translation-review-apply"
              disabled={applyBusy || applyBlocked || review.drafts.length === 0}
              loading={applyBusy}
              onClick={handleApply}
            >
              {t('admin.apply', 'Apply translations')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-8 whitespace-normal font-semibold"
              data-testid="plugin-ai-translation-review-back"
              onClick={() => {
                controller.stop()
                leaveReview?.()
                setReview(null)
              }}
            >
              {t('admin.review.back', 'Back to all texts')}
            </Button>
          </div>
        )}

        {applyOutcome?.rejected && (
          <div className="aitr-error" role="alert" ref={resultRef} tabIndex={-1} data-testid="plugin-ai-translation-apply-rejected">
            <p className="aitr-error-title">
              <LucideIcon name="circle-alert" aria-hidden="true" />
              {t('admin.apply_rejected.title', 'Translations not saved')}
            </p>
            <p className="aitr-error-body">
              {t('admin.apply_rejected.body', 'The suggestions could not be saved. Nothing was changed. Try again.')}
            </p>
          </div>
        )}

        {applyOutcome?.unknown && (
          <div className="aitr-error" role="alert" ref={resultRef} tabIndex={-1} data-testid="plugin-ai-translation-apply-unknown">
            <p className="aitr-error-title">
              <LucideIcon name="circle-alert" aria-hidden="true" />
              {t('admin.apply_unknown.title', 'Result unknown')}
            </p>
            <p className="aitr-error-body">
              {t('admin.apply_unknown.body', 'The response was interrupted. Check the table before applying again.')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-8 whitespace-normal font-semibold"
              data-testid="plugin-ai-translation-apply-reconcile"
              onClick={handleReconcile}
            >
              {t('admin.apply_unknown.reconcile', 'Refetch suggestions')}
            </Button>
          </div>
        )}

        {applyOutcome && !applyOutcome.rejected && !applyOutcome.unknown && (
          <div className="aitr-result" role="status" ref={resultRef} tabIndex={-1} data-testid="plugin-ai-translation-apply-result">
            <p className="aitr-result-title">
              <LucideIcon name="circle-check" aria-hidden="true" />
              {applyOutcome.written === 1
                ? interpolateDefault(t('admin.apply_result.one', '{{written}} translation saved.'), { written: applyOutcome.written })
                : interpolateDefault(t('admin.apply_result.other', '{{written}} translations saved.'), { written: applyOutcome.written })}
            </p>
            {applyOutcome.skipped > 0 && (
              <p className="aitr-result-body">
                {interpolateDefault(t('admin.apply_skipped', '{{skipped}} skipped because the text was filled in the meantime.'), { skipped: applyOutcome.skipped })}
              </p>
            )}
            {applyOutcome.invalid > 0 && (
              <p className="aitr-result-body">
                {interpolateDefault(t('admin.apply_invalid', '{{invalid}} not saved; see the marked rows.'), { invalid: applyOutcome.invalid })}
              </p>
            )}
            {skippedKeys.length > 0 && (
              <div className="aitr-skipped">
                <p className="aitr-skipped-label">{t('admin.skipped_label', 'Skipped keys')}</p>
                <ul className="aitr-skipped-list">
                  {skippedKeys.map((key) => (
                    <li key={key} className="aitr-skipped-key">{key}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Browse view.
  const showStart = eligibility !== null && eligibility.state === 'eligible' && !running

  return (
    <div className="aitr-admin" data-testid="plugin-ai-translation-admin">
      <div className="aitr-admin-row">
        {showStart && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon="sparkles"
            className="h-auto min-h-8 whitespace-normal font-semibold"
            data-testid="plugin-ai-translation-admin-start"
            disabled={busy}
            loading={busy}
            onClick={handleStart}
          >
            {t('admin.action', 'Translate with AI')}
          </Button>
        )}
        {suggestionTotal > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 whitespace-normal font-semibold"
            data-testid="plugin-ai-translation-admin-review"
            onClick={handleReview}
          >
            {suggestionTotal === 1
              ? interpolateDefault(t('admin.review.one', 'Review {{count}} suggestion'), { count: suggestionTotal })
              : interpolateDefault(t('admin.review.other', 'Review {{count}} suggestions'), { count: suggestionTotal })}
          </Button>
        )}
      </div>

      {eligibility?.state === 'eligible' && (
        <p className="aitr-eligible" data-testid="plugin-ai-translation-admin-eligible">
          {eligibility.eligibleTotal === 1
            ? interpolateDefault(t('admin.eligible.one', '{{count}} missing text in this filter can be translated. One run covers up to 100.'), { count: eligibility.eligibleTotal })
            : interpolateDefault(t('admin.eligible.other', '{{count}} missing texts in this filter can be translated. One run covers up to 100.'), { count: eligibility.eligibleTotal })}
        </p>
      )}

      {eligibility?.state === 'none_missing' && (
        <p className="aitr-helper" data-testid="plugin-ai-translation-admin-none">
          {t('admin.nothing_missing', 'No missing translations in this filter.')}
        </p>
      )}

      {eligibility?.state === 'missing_not_eligible' && (
        <p className="aitr-helper" data-testid="plugin-ai-translation-admin-ineligible">
          {t('admin.missing_not_eligible', "The missing texts in this filter can't be translated with AI. They are technical strings, already have an open suggestion, or were discarded before. Translate them manually.")}
        </p>
      )}

      {run && <RunStatus run={run} surface="admin" languageName={language} />}

      {status === 'conflict' && (
        <div className="aitr-notice" role="status" data-testid="plugin-ai-translation-admin-conflict">
          <LucideIcon name="clock" aria-hidden="true" />
          <span>
            {interpolateDefault(t('admin.conflict.body', 'An AI translation for {{language}} is already in progress. Wait for it to finish, then start the next block.'), { language })}
          </span>
        </div>
      )}

      {status === 'error' && errorCopy && (
        <div className="aitr-error" role="alert" data-testid="plugin-ai-translation-admin-error">
          <p ref={errorTitleRef} tabIndex={-1} className="aitr-error-title" data-testid="plugin-ai-translation-admin-error-title">
            <LucideIcon name="circle-alert" aria-hidden="true" />
            {t(errorCopy.titleKey, errorCopy.title)}
          </p>
          <p className="aitr-error-body">{t(errorCopy.bodyKey, errorCopy.body)}</p>
          {retryAllowed(errorCode) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-8 whitespace-normal font-semibold"
              data-testid="plugin-ai-translation-admin-retry"
              onClick={handleStart}
            >
              {t('error.try_again', 'Try again')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
