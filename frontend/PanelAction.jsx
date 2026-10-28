// Phase 307 (AITR-01, S1): the ai-translation field-suggestion panel action.
//
// The host TranslationPanel owns the fields, the per-pair draft markers and the
// Save. This contribution owns exactly the generation action: it loads existing
// open suggestions on mount, delivers real proposals through `acceptDraft`, and
// registers the protected commit/discard handlers the host calls on Save. It
// knows no Core upsert and never manufactures a proposal from the field values.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  LucideIcon,
  api,
  injectPluginStyles,
  usePluginTranslation,
} from '@indramesh/plugin-api'

import styles from './panel.css?inline'
import {
  ERROR_COPY,
  createPanelTranslationController,
  retryAllowed,
} from './translation-state.js'

const PLUGIN_NAME = 'ai-translation'
const MULTILINGUAL_ENTITY_TYPES = new Set(['status', 'reference_type'])

function stylesWereRefused() {
  if (typeof document === 'undefined') return false
  const element = document.querySelector(
    'style[data-plugin-owner="ai-translation"][data-plugin-style="panel"]',
  )
  return !!element && element.sheet === null
}

export default function PanelAction({
  entityType,
  entityId,
  targetLanguages = [],
  eligiblePairs = [],
  sessionId,
  scopeRevision,
  canWrite,
  requestScope,
  registerDraftHandlers,
  acceptDraft,
  getCurrentEligiblePairs,
  onPresenceChanged,
  disabled,
}) {
  const { t } = usePluginTranslation(PLUGIN_NAME)

  const [available, setAvailable] = useState(null) // null = unresolved (fail closed)
  const [status, setStatus] = useState('idle') // idle | pending | error | conflict
  const [errorCode, setErrorCode] = useState(null)
  const [stylesRefused, setStylesRefused] = useState(false)

  const mountedRef = useRef(true)
  const errorTitleRef = useRef(null)
  const onEventRef = useRef(null)

  // The host replaces its draft session AND its request scope right after mount
  // (fresh session/abort controller per entity/reopen), so every host seam is
  // resolved from the latest render at call time. Freezing the first render's
  // closures would deliver drafts into a replaced session and abort generation
  // through the initial aborted request scope.
  const hostRef = useRef(null)
  hostRef.current = {
    requestScope,
    acceptDraft,
    registerDraftHandlers,
    getCurrentEligiblePairs,
    sessionId,
    scopeRevision,
  }

  // One controller per mount; only `api` is a truly stable host singleton.
  const controllerRef = useRef(null)
  if (controllerRef.current === null) {
    controllerRef.current = createPanelTranslationController({
      api,
      entityType,
      entityId,
      getRequestScope: () => hostRef.current.requestScope,
      acceptDraft: (payload) => hostRef.current.acceptDraft?.(payload),
      registerDraftHandlers: (handlers) => hostRef.current.registerDraftHandlers?.(handlers),
      getEligiblePairs: () => hostRef.current.getCurrentEligiblePairs?.() ?? [],
      getSession: () => ({
        sessionId: hostRef.current.sessionId,
        scopeRevision: hostRef.current.scopeRevision,
      }),
      onEvent: (event) => onEventRef.current?.(event),
    })
  }
  const controller = controllerRef.current

  onEventRef.current = (event) => {
    if (!mountedRef.current) return
    if (event.type === 'error') {
      setStatus(event.code === 'already_running' ? 'conflict' : 'error')
      setErrorCode(event.code)
    } else if (event.type === 'generated') {
      setStatus('idle')
      setErrorCode(null)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // One scoped stylesheet, injected on mount and released on unmount. A refused
  // injector OR a CSP-blocked <style> falls back to a local block instead of an
  // unstyled action (S5).
  useEffect(() => {
    const handle = injectPluginStyles(PLUGIN_NAME, 'panel', styles)
    if (!handle?.ok || stylesWereRefused()) setStylesRefused(true)
    return () => handle?.release?.()
  }, [])

  // Register the protected commit/discard handlers on the current draft session.
  // The host replaces its session after mount, so this follows the live identity:
  // a handler set left on the replaced session would make every delivery and
  // commit be refused as coming from an unregistered owner.
  useEffect(() => {
    const unregister = controller.registerHandlers()
    return () => {
      if (typeof unregister === 'function') unregister()
    }
  }, [controller, sessionId, scopeRevision])

  // Availability (button visibility) + existing suggestions on mount. Both are
  // silent; a failure keeps generation hidden (fail closed) and never blocks the
  // manual fields.
  useEffect(() => {
    let cancelled = false
    api
      .get('plugins/ai-translation/data/status', {
        params: { translation_type: entityType, entity_id: entityId },
      })
      .then((response) => {
        if (!cancelled) setAvailable(response?.data?.available === true)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    void controller.loadExistingSuggestions()
    return () => {
      cancelled = true
    }
    // The host swaps its draft session right after mount, so the reload must
    // follow the live identity — otherwise a delivered draft lands in the
    // replaced session and is never shown.
  }, [controller, entityType, entityId, sessionId, scopeRevision])

  useEffect(() => {
    if (status === 'error') errorTitleRef.current?.focus()
  }, [status])

  // UI-SPEC panel prerequisite: a status/reference_type entity in a schema that
  // is not multilingual (no enabled target language) shows the button DISABLED
  // with the prerequisite helper — it is never hidden once a target language
  // exists. `requiresMultilingual` names the entity kind; `missingMultilingual`
  // is the actual disabled-state gate.
  const requiresMultilingual = MULTILINGUAL_ENTITY_TYPES.has(entityType)
  const noTargetLanguages = targetLanguages.length === 0
  const missingMultilingual = requiresMultilingual && noTargetLanguages
  const noEligible = eligiblePairs.length === 0
  const busy = status === 'pending'

  const errorCopy = useMemo(() => (errorCode ? ERROR_COPY[errorCode] : null), [errorCode])

  const runGeneration = async () => {
    if (busy) return
    setStatus('pending')
    setErrorCode(null)
    const result = await controller.generate()
    if (!mountedRef.current) return
    if (result.ok || result.reason === 'error' || result.reason === 'pending') return
    if (result.reason === 'aborted' || result.reason === 'stale' || result.reason === 'ignored') return
    // 'no_eligible' | 'invalid' → nothing visible beyond the helper text.
    setStatus('idle')
  }

  if (stylesRefused) {
    return (
      <div className="aitr-panel" data-testid="plugin-ai-translation-panel">
        <div className="aitr-styles-refused" role="alert" data-testid="plugin-ai-translation-styles-refused">
          {t(
            'styles.refused',
            'The AI translation action could not be styled, so it is not shown. Manual translation still works.',
          )}
        </div>
      </div>
    )
  }

  const showButton = available === true

  // Nothing visible to render (no button, no status, no error): the delivered
  // drafts are the visible result, so the action row stays empty. A missing
  // target language still renders the prerequisite helper below.
  if (!showButton && status === 'idle' && !errorCopy && !missingMultilingual) {
    return null
  }

  return (
    <div className="aitr-panel" data-testid="plugin-ai-translation-panel">
      {showButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon="sparkles"
          className="h-auto min-h-8 whitespace-normal font-semibold"
          data-testid="plugin-ai-translation-generate"
          disabled={busy || noTargetLanguages || noEligible}
          loading={busy}
          onClick={runGeneration}
        >
          {t('panel.action', 'Translate with AI')}
        </Button>
      )}

      {missingMultilingual && (
        <p className="aitr-helper" data-testid="plugin-ai-translation-prerequisite">
          {t(
            'panel.prerequisite',
            'Enable at least two languages for this schema to translate statuses and reference types.',
          )}
        </p>
      )}

      {!missingMultilingual && !noTargetLanguages && noEligible && showButton && (
        <p className="aitr-helper" data-testid="plugin-ai-translation-nothing-eligible">
          {t(
            'panel.nothing_eligible',
            'All target fields are filled or edited. Nothing to suggest.',
          )}
        </p>
      )}

      {busy && (
        <p className="aitr-pending" role="status" aria-live="polite" data-testid="plugin-ai-translation-pending">
          <LucideIcon name="loader-circle" className="aitr-spinner" aria-hidden="true" />
          {t('panel.pending', 'Preparing suggestions…')}
        </p>
      )}

      {status === 'conflict' && (
        <div className="aitr-notice" role="status" data-testid="plugin-ai-translation-conflict">
          <LucideIcon name="clock" aria-hidden="true" />
          <span>
            {t(
              'panel.conflict',
              'Suggestions for this item or its schema are already being prepared. Try again when that has finished.',
            )}
          </span>
        </div>
      )}

      {status === 'error' && errorCopy && (
        <div className="aitr-error" role="alert" data-testid="plugin-ai-translation-error">
          <p
            ref={errorTitleRef}
            tabIndex={-1}
            className="aitr-error-title"
            data-testid="plugin-ai-translation-error-title"
          >
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
              data-testid="plugin-ai-translation-retry"
              onClick={runGeneration}
            >
              {t('error.try_again', 'Try again')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
