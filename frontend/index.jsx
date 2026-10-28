// Phase 307 (AITR-01/02/03): the ai-translation registration bundle entry.
//
// The default export declares the plugin's contributions on the three existing
// host surfaces — the translation panel action, the schema settings section and
// the translation admin action — plus the plugin's own five per-language
// catalogs. There is no page and no navigation contribution. Every host
// singleton is imported from `@indramesh/plugin-api` (externalized by identity
// at build), so the bundle shares the host's one React instance and
// authenticated api client.
import { api } from '@indramesh/plugin-api'

import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import pt from './locales/pt.json'
import PanelAction from './PanelAction.jsx'
import SchemaSection from './SchemaSection.jsx'
import AdminAction from './AdminAction.jsx'
import { panelIsPresent, schemaPresent, uiPresent } from './translation-state.js'

const DATA_PERMISSION = 'ai-translation:data'
const UI_PERMISSION = 'ai-translation:ui'

// D-16: the panel action is present when a configured LLM exists OR the entity
// already has open suggestions to deliver. The predicate is side-effect free
// and fails closed; the mounted component delivers existing drafts.
function panelPresent(context) {
  return panelIsPresent({
    api,
    entityType: context?.entityType,
    entityId: context?.entityId,
  })
}

// D-16: the schema section is present when the LLM is configured OR the schema
// has authorized run history; otherwise no frame is rendered.
function schemaSectionPresent(context) {
  return schemaPresent({ api, schemaId: context?.schemaId })
}

// D-16/S3: the admin action is present when the editor language is not the
// authored English source language and either a configured LLM exists OR the
// user can read open UI suggestions. It is hidden entirely in `en`.
function adminPresent(context) {
  return uiPresent({ api, language: context?.language })
}

export default {
  // FEEXT-04: the plugin ships its own per-language catalogs; the host installs
  // them under the plugin-assigned namespace `plugin-ai-translation`.
  translations: { en, de, es, fr, pt },
  translationPanelActions: [
    {
      id: 'field-translation',
      label: 'Translate with AI',
      labelKey: 'panel.action',
      permission: DATA_PERMISSION,
      isPresent: panelPresent,
      component: PanelAction,
    },
  ],
  schemaSettingsSections: [
    {
      id: 'schema-translation',
      label: 'AI translation',
      labelKey: 'schema.heading',
      permission: DATA_PERMISSION,
      isPresent: schemaSectionPresent,
      component: SchemaSection,
    },
  ],
  translationAdminActions: [
    {
      id: 'ui-translation',
      label: 'Translate with AI',
      labelKey: 'admin.action',
      permission: UI_PERMISSION,
      isPresent: adminPresent,
      component: AdminAction,
    },
  ],
}
