// Phase 307 (AITR-02, S2): the ai-translation schema settings section.
//
// The plugin contributes one `schemaSettingsSections` entry that renders in the
// existing below-tabs frame. It owns exactly the schema surface: the intro, the
// open-suggestion overview, the honest run status block and the one start
// button. It never navigates on start (D-09) and never cancels a run (D-11).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  CheckboxField,
  LucideIcon,
  api,
  injectPluginStyles,
  interpolateDefault,
  usePluginTranslation,
} from '@indramesh/plugin-api'

import RunStatus from './RunStatus.jsx'
import SchemaReview from './SchemaReview.jsx'
import schemaStyles from './schema.css?inline'
import {
  ERROR_COPY,
  SCHEMA_AVAILABILITY_PATH,
  SCHEMA_OPEN_COUNT_PATH,
  SCHEMA_TRANSLATION_TYPES,
  bindResumeOnVisible,
  createRunStatusController,
  createSchemaTranslationController,
  isTerminalOutcome,
  loadSchemaCandidates,
  normalizeTranslationTypes,
  retryAllowed,
  schemaStartBlock,
  summarizeSchemaCandidates,
} from './translation-state.js'

const PLUGIN_NAME = 'ai-translation'

function stylesWereRefused() {
  if (typeof document === 'undefined') return false
  const element = document.querySelector(
    'style[data-plugin-owner="ai-translation"][data-plugin-style="schema"]',
  )
  return !!element && element.sheet === null
}

export default function SchemaSection({ schema }) {
  const { t } = usePluginTranslation(PLUGIN_NAME)
  const schemaId = schema?.id ?? null
  const defaultLanguageCode = schema?.default_language_code ?? null

  const [available, setAvailable] = useState(null)
  const [openCount, setOpenCount] = useState(null)
  const [targetLanguages, setTargetLanguages] = useState([])
  const [run, setRun] = useState(null)
  const [status, setStatus] = useState('idle') // idle | starting | error | conflict
  const [errorCode, setErrorCode] = useState(null)
  const [stylesRefused, setStylesRefused] = useState(false)
  const [selectedKinds, setSelectedKinds] = useState(() => [...SCHEMA_TRANSLATION_TYPES])
  const [candidates, setCandidates] = useState(null)
  const [candidateState, setCandidateState] = useState('loading') // loading | ready | error

  const mountedRef = useRef(true)
  const errorTitleRef = useRef(null)
  const candidateSeqRef = useRef(0)
  const awaitingRunRef = useRef(false)

  // The host keeps one section instance across schema routes, so a different
  // schemaId means everything below describes a schema that is no longer on
  // screen. Drop it during render (React's "adjust state when a prop changes"
  // pattern): the new schema's first answer decides the block, never the
  // previous schema's run or a stale conflict/error notice.
  const [boundSchemaId, setBoundSchemaId] = useState(schemaId)
  if (boundSchemaId !== schemaId) {
    setBoundSchemaId(schemaId)
    setRun(null)
    setStatus('idle')
    setErrorCode(null)
    setSelectedKinds([...SCHEMA_TRANSLATION_TYPES])
    setCandidates(null)
    setCandidateState('loading')
    awaitingRunRef.current = false
  }

  // Both controllers freeze their schemaId at construction, so they must be
  // rebuilt for the schema that is on screen. The mount effect below stops the
  // previous controller when the memo yields a new one.
  const runController = useMemo(
    () =>
      schemaId
        ? createRunStatusController({
            api,
            kind: 'schema',
            schemaId,
            onEvent: (event) => {
              if (!mountedRef.current) return
              if (event.type === 'run') setRun(event.run)
              else if (event.type === 'run_error') setRun(null)
            },
          })
        : null,
    [schemaId],
  )

  const startController = useMemo(
    () => (schemaId ? createSchemaTranslationController({ api, schemaId }) : null),
    [schemaId],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // The pre-start count is fetched once per schema view and only re-read after a
  // start, a review change or a finished run — never on a checkbox toggle. A
  // late answer for an older request or schema is dropped.
  const refreshCandidates = useCallback(() => {
    if (!schemaId) return
    const seq = candidateSeqRef.current + 1
    candidateSeqRef.current = seq
    void loadSchemaCandidates({ api, schemaId }).then((result) => {
      if (!mountedRef.current || seq !== candidateSeqRef.current) return
      if (!result.ok) {
        setCandidates(null)
        setCandidateState('error')
        return
      }
      setCandidates(result.items)
      setCandidateState('ready')
    })
  }, [schemaId])

  useEffect(() => {
    if (!schemaId) return undefined
    setCandidateState('loading')
    refreshCandidates()
    return undefined
  }, [schemaId, refreshCandidates])

  // A run this section saw non-terminal (or that it started) changes the count
  // once when it reaches a terminal outcome.
  useEffect(() => {
    if (!run) return
    if (!isTerminalOutcome(run.outcome)) {
      awaitingRunRef.current = true
      return
    }
    if (awaitingRunRef.current) {
      awaitingRunRef.current = false
      refreshCandidates()
    }
  }, [run, refreshCandidates])

  useEffect(() => {
    const handle = injectPluginStyles(PLUGIN_NAME, 'schema', schemaStyles)
    if (!handle?.ok || stylesWereRefused()) setStylesRefused(true)
    return () => handle?.release?.()
  }, [])

  // Availability, enabled languages and the open-suggestion overview. All are
  // silent; a failure keeps generation hidden (fail closed).
  useEffect(() => {
    if (!schemaId) return undefined
    let cancelled = false

    api
      .get(SCHEMA_AVAILABILITY_PATH)
      .then((response) => {
        if (!cancelled) setAvailable(response?.data?.available === true)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })

    api
      .get(`schemas/${schemaId}/languages`)
      .then((response) => {
        if (cancelled) return
        const languages = Array.isArray(response?.data) ? response.data : []
        setTargetLanguages(languages.filter((language) => language.code !== defaultLanguageCode))
      })
      .catch(() => {
        if (!cancelled) setTargetLanguages([])
      })

    api
      .get(SCHEMA_OPEN_COUNT_PATH, { params: { schema_id: schemaId } })
      .then((response) => {
        if (!cancelled) setOpenCount(response?.data?.open_count ?? 0)
      })
      .catch(() => {
        if (!cancelled) setOpenCount(null)
      })

    return () => {
      cancelled = true
    }
  }, [schemaId, defaultLanguageCode])

  // Find the active/latest run on mount and keep polling until terminal; the
  // controller stops on unmount and never cancels a background task.
  useEffect(() => {
    if (!schemaId || !runController) return undefined
    void runController.start()
    return () => runController.stop()
  }, [runController, schemaId])

  // An idle poller (a schema without a run) looks again when the tab becomes
  // visible or the window regains focus — one re-check, never a background poll.
  useEffect(() => {
    if (!schemaId || !runController) return undefined
    return bindResumeOnVisible(runController, { doc: document, win: window })
  }, [runController, schemaId])

  useEffect(() => {
    if (status === 'error') errorTitleRef.current?.focus()
  }, [status])

  const running = run !== null && !isTerminalOutcome(run.outcome)
  const noTargetLanguages = targetLanguages.length === 0
  const busy = status === 'starting'
  const errorCopy = errorCode ? ERROR_COPY[errorCode] : null
  const showStart = available === true && !running
  const summary = useMemo(
    () => summarizeSchemaCandidates(candidates, selectedKinds),
    [candidates, selectedKinds],
  )
  const startBlock = schemaStartBlock({ selected: selectedKinds, summary })

  const refreshOpenCount = () => {
    api
      .get(SCHEMA_OPEN_COUNT_PATH, { params: { schema_id: schemaId } })
      .then((response) => {
        if (mountedRef.current) setOpenCount(response?.data?.open_count ?? 0)
      })
      .catch(() => {})
  }

  const refreshAfterReview = () => {
    refreshOpenCount()
    refreshCandidates()
  }

  const toggleKind = (kind) => {
    setSelectedKinds((current) => {
      const next = current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : [...current, kind]
      return normalizeTranslationTypes(next)
    })
  }

  const handleStart = async () => {
    if (busy) return
    setStatus('starting')
    setErrorCode(null)
    const result =
      (await startController?.start({ translationTypes: selectedKinds })) ?? {
        ok: false,
        reason: 'ignored',
      }
    if (!mountedRef.current) return
    if (result.ok) {
      setStatus('idle')
      awaitingRunRef.current = true
      runController?.stop()
      void runController?.start({ awaitRun: true, taskId: result.task?.id ?? null })
      refreshOpenCount()
      refreshCandidates()
      return
    }
    if (result.reason === 'pending' || result.reason === 'ignored' || result.reason === 'invalid') {
      setStatus('idle')
      return
    }
    if (result.code === 'already_running') {
      setStatus('conflict')
      runController?.stop()
      void runController?.start()
      return
    }
    setStatus('error')
    setErrorCode(result.code ?? 'unexpected')
  }

  if (stylesRefused) {
    return (
      <div className="aitr-schema" data-testid="plugin-ai-translation-schema">
        <div className="aitr-styles-refused" role="alert" data-testid="plugin-ai-translation-schema-styles-refused">
          {t(
            'styles.refused.section',
            'The AI translation section could not be styled, so it is not shown. Manual translation still works.',
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="aitr-schema" data-testid="plugin-ai-translation-schema">
      <p className="aitr-intro">
        {t(
          'schema.intro',
          'Suggests missing translations for the kinds you select below (ObjectTypes, attributes, select options, object values, statuses and reference types) in every enabled target language. You review the suggestions in the list below; nothing is saved automatically.',
        )}
      </p>

      {openCount !== null && openCount > 0 && (
        <p className="aitr-open-count" data-testid="plugin-ai-translation-open-count">
          {openCount === 1
            ? t('schema.open_count.one', '{{count}} suggestion is waiting for review in this schema.', {
                count: openCount,
              })
            : t('schema.open_count.other', '{{count}} suggestions are waiting for review in this schema.', {
                count: openCount,
              })}
        </p>
      )}

      {run ? (
        <RunStatus run={run} surface="schema" openCount={openCount} />
      ) : (
        available === true && (
          <div className="aitr-empty" data-testid="plugin-ai-translation-empty">
            <p className="aitr-empty-title">{t('schema.empty.title', 'No AI translation run yet')}</p>
            <p className="aitr-empty-body">
              {t(
                'schema.empty.body',
                'Start a run to get suggestions for missing translations. You review and save them in the list that appears here.',
              )}
            </p>
          </div>
        )
      )}

      <SchemaReview
        schemaId={schemaId}
        reloadKey={run ? `${run.task_id}:${run.outcome}` : null}
        onChanged={refreshAfterReview}
      />

      {status === 'conflict' && (
        <div className="aitr-notice" role="status" data-testid="plugin-ai-translation-schema-conflict">
          <LucideIcon name="clock" aria-hidden="true" />
          <span>
            {t(
              'schema.conflict.body',
              'An AI translation is already running for this schema. Wait for it to finish, then start again.',
            )}
          </span>
        </div>
      )}

      {status === 'error' && errorCopy && (
        <div className="aitr-error" role="alert" data-testid="plugin-ai-translation-schema-error">
          <p ref={errorTitleRef} tabIndex={-1} className="aitr-error-title" data-testid="plugin-ai-translation-schema-error-title">
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
              data-testid="plugin-ai-translation-schema-retry"
              onClick={handleStart}
            >
              {t('error.try_again', 'Try again')}
            </Button>
          )}
        </div>
      )}

      {showStart && (
        <div className="aitr-actions">
          <fieldset
            className="aitr-kinds"
            data-testid="plugin-ai-translation-schema-kinds"
          >
            <legend className="aitr-kinds-legend">{t('schema.kinds.legend', 'Translate')}</legend>
            <div className="aitr-kinds-grid">
              {SCHEMA_TRANSLATION_TYPES.map((kind) => (
                <CheckboxField
                  key={kind}
                  id={`aitr-schema-kind-${kind}`}
                  data-testid={`plugin-ai-translation-schema-kind-${kind}`}
                  label={t(`schema.kinds.${kind}`, kind)}
                  checked={selectedKinds.includes(kind)}
                  onChange={() => toggleKind(kind)}
                  disabled={busy}
                />
              ))}
            </div>
          </fieldset>

          {!noTargetLanguages && (
            <p
              className="aitr-missing"
              role="status"
              aria-live="polite"
              data-testid="plugin-ai-translation-schema-missing"
            >
              {candidateState === 'loading' &&
                t('schema.missing.loading', 'Counting missing translations…')}
              {candidateState === 'error' &&
                t(
                  'schema.missing.unavailable',
                  'The number of missing translations could not be loaded. You can still start a run.',
                )}
              {candidateState === 'ready' &&
                summary &&
                (summary.missing === 0
                  ? t('schema.missing.none', 'No missing translations in this selection.')
                  : (
                    <>
                      {interpolateDefault(
                        summary.missing === 1
                          ? t(
                              'schema.missing.one',
                              '{{count}} missing translation in this selection.',
                            )
                          : t(
                              'schema.missing.other',
                              '{{count}} missing translations in this selection.',
                            ),
                        { count: summary.missing },
                      )}
                      {summary.requestable === 0
                        ? ` ${t(
                            'schema.missing.all_waiting',
                            'Every missing translation in this selection already has a suggestion waiting for review.',
                          )}`
                        : summary.waiting > 0
                          ? ` ${interpolateDefault(
                              summary.waiting === 1
                                ? t(
                                    'schema.missing.waiting.one',
                                    '{{count}} of them already has a suggestion waiting for review.',
                                  )
                                : t(
                                    'schema.missing.waiting.other',
                                    '{{count}} of them already have a suggestion waiting for review.',
                                  ),
                              { count: summary.waiting },
                            )}`
                          : null}
                    </>
                  ))}
            </p>
          )}

          {startBlock === 'none_selected' && (
            <p className="aitr-helper" data-testid="plugin-ai-translation-schema-none-selected">
              {t(
                'schema.kinds.none_selected',
                'Select at least one kind to start a run.',
              )}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon="sparkles"
            className="h-auto min-h-8 whitespace-normal font-semibold"
            data-testid="plugin-ai-translation-schema-start"
            disabled={busy || noTargetLanguages || startBlock !== null}
            loading={busy}
            onClick={handleStart}
          >
            {t('schema.start', 'Translate schema with AI')}
          </Button>
          {noTargetLanguages && (
            <p className="aitr-helper" data-testid="plugin-ai-translation-schema-prerequisite">
              {t(
                'schema.prerequisite',
                'Enable at least one target language for this schema to request translations.',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
