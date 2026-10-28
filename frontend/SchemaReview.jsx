// The schema section's review list: every open data proposal of this schema
// the caller may read, with the place it belongs to, an editable proposal and
// Apply/Discard. Saving goes through the same per-entity apply/discard routes
// as the translation panels, so the Core write rules stay in one place.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  LucideIcon,
  TextInput,
  api,
  interpolateDefault,
  useObject,
  useObjectType,
  usePluginTranslation,
} from '@indramesh/plugin-api'

import { SCHEMA_SUGGESTIONS_PATH, PLUGIN_PREFIX } from './translation-state.js'

const PLUGIN_NAME = 'ai-translation'

const TYPE_LABELS = {
  object_type: 'ObjectType',
  object_type_attribute: 'Attribute',
  select_option: 'Select option',
  object_value: 'Value',
  status: 'Status',
  reference_type: 'Reference type',
}

// The host lists that show a translated name, refreshed after a save so the
// sidebar tree and tables pick up the new text without a reload.
const ENTITY_QUERY_KEYS = {
  object_type: ['object-types'],
  object_type_attribute: ['object-type-attributes'],
  select_option: ['object-type-attributes'],
  object_value: ['objects'],
  status: ['statuses'],
  reference_type: ['reference-types'],
}

function scopeParams(item) {
  return { translation_type: item.translation_type, entity_id: item.entity_id }
}

function OwnerLink({ item }) {
  const { t } = usePluginTranslation(PLUGIN_NAME)
  const object = useObject(item.object_id ?? undefined)
  const objectType = useObjectType(item.object_id ? undefined : item.object_type_id ?? undefined)
  const typeLabel = t(`review.type.${item.translation_type}`, TYPE_LABELS[item.translation_type] ?? item.translation_type)

  if (item.object_id) {
    return (
      <span className="aitr-review-owner">
        <Link to={`/browse/objects/${item.object_id}`} className="aitr-review-link">
          {object.data?.name ?? t('review.object', 'Object')}
        </Link>
        <span className="aitr-review-type">{typeLabel}</span>
      </span>
    )
  }
  if (item.object_type_id) {
    return (
      <span className="aitr-review-owner">
        <Link to={`/browse/object-types/${item.object_type_id}`} className="aitr-review-link">
          {objectType.data?.name ?? t('review.type.object_type', 'ObjectType')}
        </Link>
        <span className="aitr-review-type">{typeLabel}</span>
      </span>
    )
  }
  return (
    <span className="aitr-review-owner">
      <span className="aitr-review-type">{typeLabel}</span>
    </span>
  )
}

export default function SchemaReview({ schemaId, reloadKey, onChanged }) {
  const { t } = usePluginTranslation(PLUGIN_NAME)
  const queryClient = useQueryClient()
  const [items, setItems] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!schemaId) return
    try {
      const response = await api.get(SCHEMA_SUGGESTIONS_PATH, { params: { schema_id: schemaId } })
      if (!mountedRef.current) return
      setItems(response?.data?.items ?? [])
      setHasMore(response?.data?.has_more === true)
    } catch {
      if (mountedRef.current) setItems(null)
    }
  }, [schemaId])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const valueOf = (item) => drafts[item.suggestion_id] ?? item.proposed_text

  const apply = async (selected) => {
    const groups = new Map()
    for (const item of selected) {
      const value = valueOf(item).trim()
      if (!value) continue
      const key = `${item.translation_type}:${item.entity_id}`
      if (!groups.has(key)) groups.set(key, { item, entries: [] })
      groups.get(key).entries.push({ suggestion_id: item.suggestion_id, value })
    }
    if (groups.size === 0) return
    setBusy(true)
    setOutcome(null)
    let written = 0
    let skipped = 0
    let failed = 0
    for (const { item, entries } of groups.values()) {
      try {
        const response = await api.post(
          `${PLUGIN_PREFIX}/data/apply`,
          { items: entries },
          { params: scopeParams(item) },
        )
        const writtenHere = response?.data?.written ?? 0
        written += writtenHere
        const entityKey = ENTITY_QUERY_KEYS[item.translation_type]
        if (writtenHere > 0) {
          queryClient.invalidateQueries({
            queryKey: ['translations', { translationType: item.translation_type, entityId: item.entity_id }],
          })
          if (entityKey) queryClient.invalidateQueries({ queryKey: entityKey })
        }
        skipped += response?.data?.skipped ?? 0
        failed += response?.data?.invalid ?? 0
      } catch {
        failed += entries.length
      }
    }
    if (!mountedRef.current) return
    setBusy(false)
    setOutcome({ written, skipped, failed })
    await load()
    onChanged?.()
  }

  const discard = async (item) => {
    setBusy(true)
    setOutcome(null)
    try {
      await api.delete(`${PLUGIN_PREFIX}/data/suggestions/${item.suggestion_id}`, {
        params: scopeParams(item),
      })
    } catch {
      if (mountedRef.current) setOutcome({ written: 0, skipped: 0, failed: 1 })
    }
    if (!mountedRef.current) return
    setBusy(false)
    await load()
    onChanged?.()
  }

  if (!items || (items.length === 0 && !outcome)) return null

  const updatable = items.filter((item) => item.can_update)

  return (
    <div className="aitr-review" data-testid="plugin-ai-translation-schema-review">
      <div className="aitr-review-head">
        <p className="aitr-review-title">{t('review.title', 'Suggestions to review')}</p>
        {updatable.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 whitespace-normal font-semibold"
            data-testid="plugin-ai-translation-review-apply-all"
            disabled={busy}
            loading={busy}
            onClick={() => apply(updatable)}
          >
            {interpolateDefault(t('review.apply_all', 'Apply all {{count}}'), { count: updatable.length })}
          </Button>
        )}
      </div>

      {outcome && (
        <p className="aitr-review-outcome" role="status" data-testid="plugin-ai-translation-review-outcome">
          {interpolateDefault(
            t('review.outcome', '{{written}} saved, {{skipped}} skipped because a translation already exists, {{failed}} not saved.'),
            outcome,
          )}
        </p>
      )}

      {items.length > 0 && (
        <ul className="aitr-review-list">
          {items.map((item) => (
            <li key={item.suggestion_id} className="aitr-review-row" data-testid="plugin-ai-translation-review-row">
              <OwnerLink item={item} />
              <span className="aitr-review-source" title={item.source_text ?? ''}>
                {item.source_text}
              </span>
              <span className="aitr-review-lang">{item.language_code.toUpperCase()}</span>
              <TextInput
                aria-label={interpolateDefault(t('review.value_label', 'Translation ({{language}})'), {
                  language: item.language_code.toUpperCase(),
                })}
                className="aitr-review-input"
                value={valueOf(item)}
                disabled={busy || !item.can_update}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [item.suggestion_id]: event.target.value }))
                }
              />
              <span className="aitr-review-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon="check"
                  data-testid="plugin-ai-translation-review-apply"
                  disabled={busy || !item.can_update || !valueOf(item).trim()}
                  onClick={() => apply([item])}
                >
                  {t('review.apply', 'Apply')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="plugin-ai-translation-review-discard"
                  aria-label={t('review.discard', 'Discard')}
                  title={t('review.discard', 'Discard')}
                  disabled={busy || !item.can_update}
                  onClick={() => discard(item)}
                >
                  <LucideIcon name="x" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <p className="aitr-helper" data-testid="plugin-ai-translation-review-more">
          {t('review.more', 'More suggestions are waiting. They appear here once these are reviewed.')}
        </p>
      )}
    </div>
  )
}
