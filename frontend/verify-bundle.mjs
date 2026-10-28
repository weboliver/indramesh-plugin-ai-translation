#!/usr/bin/env node
/**
 * Build-output inspection for the ai-translation registration bundle
 * (Phase 307, AITR-01/02/03; the Phase-306 ai-schema-wizard verifier model,
 * extended for this plugin's three-surface contract).
 *
 * Fails the build unless `plugins/ai-translation/static/ai-translation.js` is a
 * single self-contained ES file that:
 *   * imports ONLY the host singletons, externalized by identity;
 *   * makes no blob-relative sibling chunk/CSS/worker/font request;
 *   * has a default export;
 *   * registers all three of `translationPanelActions`, `translationAdminActions`
 *     and `schemaSettingsSections` and no other family;
 *   * imports only host symbols that actually exist in `@indramesh/plugin-api`;
 *   * carries all five plugin locales and its three scoped style roots
 *     (`.aitr-panel`, `.aitr-schema`, `.aitr-admin`);
 *   * calls the plugin API only through the relative `plugins/ai-translation/...`
 *     paths (an absolute `/api/v1/plugins/...` would double the host prefix);
 * and while no separate CSS asset is emitted next to it (each scoped sheet ships
 * as a JS string through the host `injectPluginStyles`).
 *
 * The verifier is self-testing (fail-first): synthetic bad bundles for a missing
 * default export, a wrong host import, a bundled singleton, an extra CSS asset,
 * a missing locale, an unknown host symbol, a missing contribution family and an
 * absolute plugin API path must each be REJECTED, while a clean control must
 * PASS. A regression in any detector therefore fails the build too — the checker
 * never merely counts source tokens.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const STATIC_DIR = path.resolve(HERE, '..', 'static')
const BUNDLE_FILE = path.join(STATIC_DIR, 'ai-translation.js')
const LOCALES_DIR = path.join(HERE, 'locales')
const HOST_API_FILE = path.resolve(HERE, '..', '..', '..', 'frontend', 'src', 'shared', 'plugin-runtime', 'host-api.js')

// The exact host singleton allow-list (frontend/index.html import map). Keep in
// sync with vite.config.mjs.
export const HOST_SINGLETONS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router',
  'react-router-dom',
  '@tanstack/react-query',
  '@indramesh/plugin-api',
]
const HOST_SET = new Set(HOST_SINGLETONS)

const REQUIRED_LOCALES = ['en', 'de', 'es', 'fr', 'pt']

// The three contribution families this plugin MUST register.
const REQUIRED_FAMILIES = [
  'translationPanelActions',
  'translationAdminActions',
  'schemaSettingsSections',
]
// Every other family is forbidden for this plugin.
const FORBIDDEN_FAMILIES = [
  'navItems',
  'pages',
  'taskDetailActions',
  'taskForms',
  'settingsSections',
  'objectTypeSettingsSections',
  'objectDetailSections',
  'itemBadges',
  'connectorConfigEditors',
  'schemaWizardEntries',
]

// The three scoped style roots (one per surface).
const REQUIRED_STYLE_ROOTS = ['.aitr-panel', '.aitr-schema', '.aitr-admin']

// Static `import ... from`, bare `import "..."`, `export ... from`, and literal
// dynamic `import("...")` specifiers.
const IMPORT_SPECIFIER_PATTERNS = [
  /^[ \t]*import\s+[^;\n]*?\bfrom\s+["']([^"']+)["']/gm,
  /^[ \t]*import\s+["']([^"']+)["']/gm,
  /^[ \t]*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
]

const DEFAULT_EXPORT_RE = /export\s+default\b|\bas\s+default\b/

const VIOLATION_PATTERNS = [
  { label: 'external font/image URL', re: /url\(\s*["']?(?:\.\.?\/)[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?\/[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?https?:[^)"']*["']?\s*\)/g },
  { label: 'CSS @import', re: /@import\b/g },
  { label: 'blob-relative sibling resolution', re: /import\s*\(\s*["']\.\.?\//g },
  { label: 'blob-relative sibling resolution', re: /import\.meta\.url/g },
  { label: 'blob-relative sibling resolution', re: /new\s+URL\s*\(\s*["']\.\.?\//g },
  { label: 'external worker URL', re: /new\s+Worker\s*\(\s*["'](?!data:|blob:)[^"']*["']/g },
  // The host `api` axios instance already carries `baseURL: '/api/v1/'`. An
  // absolute '/api/v1/plugins/...' call path doubles the prefix at runtime
  // ('/api/v1/api/v1/...' -> 404); the plugin API path must be relative to the
  // host baseURL.
  { label: 'absolute plugin API path (host api baseURL already prefixes /api/v1)', re: /["'`]\/api\/v1\/plugins\//g },
  // A bundled vendor/provider client or an embedded secret would only appear if
  // the plugin violated the "host only" contract.
  { label: 'bundled provider/vendor client', re: /\b(?:openai|anthropic|generativelanguage|azure\.com)\b/gi },
  { label: 'embedded credential literal', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
]

/** Runtime import violations (non-host imports + forbidden blob/vendor markers). */
export function findImportViolations(code) {
  const violations = []
  for (const re of IMPORT_SPECIFIER_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      if (!HOST_SET.has(match[1])) violations.push(`non-host runtime import: ${match[1]}`)
    }
  }
  for (const { label, re } of VIOLATION_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      violations.push(`${label}: ${match[0].slice(0, 80)}`)
    }
  }
  return violations
}

/** Registration-shape violations: default export + the three families only. */
export function checkRegistration(code) {
  const problems = []
  if (!DEFAULT_EXPORT_RE.test(code)) problems.push('bundle has no default export')
  for (const family of REQUIRED_FAMILIES) {
    if (!code.includes(family)) problems.push(`bundle does not register ${family}`)
  }
  for (const family of FORBIDDEN_FAMILIES) {
    if (code.includes(family)) problems.push(`bundle registers a forbidden family: ${family}`)
  }
  return problems
}

/** A separate CSS asset next to the bundle means the inline-scope contract broke. */
export function checkStyleAsset(staticFiles) {
  const cssFiles = (staticFiles ?? []).filter((name) => name.endsWith('.css'))
  return cssFiles.length > 0 ? [`separate CSS asset(s) emitted: ${cssFiles.join(', ')}`] : []
}

/** Every named import from @indramesh/plugin-api must exist in the host module. */
export function checkHostSymbols(code, hostExports) {
  const problems = []
  const re = /import\s*\{([^}]*)\}\s*from\s*["']@indramesh\/plugin-api["']/g
  const known = hostExports instanceof Set ? hostExports : new Set(hostExports ?? [])
  let match
  while ((match = re.exec(code)) !== null) {
    for (const raw of match[1].split(',')) {
      const specifier = raw.trim()
      if (specifier === '') continue
      const exported = specifier.split(/\s+as\s+/)[0].trim()
      if (!known.has(exported)) problems.push(`host import not exported by @indramesh/plugin-api: ${exported}`)
    }
  }
  return problems
}

/** All five locales present in the bundle + the three scoped style roots. */
export function checkLocalesAndStyles(code, localeLabels) {
  const problems = []
  for (const [lang, label] of Object.entries(localeLabels ?? {})) {
    if (typeof label !== 'string' || label === '') {
      problems.push(`locale ${lang} has no entry.label canary`)
      continue
    }
    if (!code.includes(label)) problems.push(`bundle is missing the ${lang} locale strings`)
  }
  for (const root of REQUIRED_STYLE_ROOTS) {
    if (!code.includes(root)) problems.push(`bundle is missing the scoped ${root} styles`)
  }
  return problems
}

/** Parse the `export { ... } from` / `export { ... }` names a host module exposes. */
export function collectHostExports(source) {
  const names = new Set()
  const re = /export\s*\{([^}]*)\}/g
  let match
  while ((match = re.exec(source)) !== null) {
    for (const raw of match[1].split(',')) {
      const specifier = raw.trim()
      if (specifier === '') continue
      const parts = specifier.split(/\s+as\s+/)
      names.add(parts[parts.length - 1].trim())
    }
  }
  return names
}

function readLocaleLabels() {
  const labels = {}
  for (const lang of REQUIRED_LOCALES) {
    const file = path.join(LOCALES_DIR, `${lang}.json`)
    if (!existsSync(file)) {
      labels[lang] = ''
      continue
    }
    try {
      labels[lang] = JSON.parse(readFileSync(file, 'utf8'))['admin.action'] ?? ''
    } catch {
      labels[lang] = ''
    }
  }
  return labels
}

function readHostExports() {
  if (!existsSync(HOST_API_FILE)) return null
  return collectHostExports(readFileSync(HOST_API_FILE, 'utf8'))
}

// ── fail-first self-test ─────────────────────────────────────────────────────

const CLEAN_CONTROL = [
  'import { useState } from "react";',
  'import { Button, injectPluginStyles } from "@indramesh/plugin-api";',
  'const panelCss = ".aitr-panel{display:flex}";',
  'const schemaCss = ".aitr-schema{display:flex}";',
  'const adminCss = ".aitr-admin{display:flex}";',
  'const api = "/plugins/ai-translation/ui/candidates";',
  'const labels = { en: "Translate with AI", de: "Mit KI übersetzen", es: "Traducir con IA", fr: "Traduire avec l\'IA", pt: "Traduzir com IA" };',
  'export default { translations: labels, translationPanelActions: [{ id: "field-translation" }], translationAdminActions: [{ id: "ui-translation" }], schemaSettingsSections: [{ id: "schema-translation" }] };',
].join('\n')
const CLEAN_LABELS = {
  en: 'Translate with AI',
  de: 'Mit KI übersetzen',
  es: 'Traducir con IA',
  fr: "Traduire avec l'IA",
  pt: 'Traduzir com IA',
}
const CLEAN_HOST_EXPORTS = new Set(['useState_unused_check', 'Button', 'injectPluginStyles'])

/**
 * Proves each detector REJECTS its controlled violation and the clean control
 * PASSES. Throws with a precise message on any regression.
 */
export function runSelfTest() {
  const assertRejects = (name, problems) => {
    if (problems.length === 0) throw new Error(`self-test: a deliberately bad bundle was NOT rejected: ${name}`)
  }

  // 1. missing default export
  assertRejects('missing default export', checkRegistration('const x = 1;\n'))

  // 2. wrong (non-host) import
  assertRejects(
    'wrong host import',
    findImportViolations('import evil from "left-pad";\nexport default evil;\n').filter((v) => v.includes('left-pad')),
  )

  // 3. bundled singleton (a relative import of React)
  assertRejects(
    'bundled singleton',
    findImportViolations('import { useState } from "./react.js";\nexport default useState;\n'),
  )

  // 4. additional CSS/chunk asset
  assertRejects('extra CSS asset', checkStyleAsset(['ai-translation.js', 'ai-translation.css']))

  // 5. missing five-locale strings
  assertRejects('missing locale strings', checkLocalesAndStyles('const x = 1;', CLEAN_LABELS))

  // 6. host symbol that the host module does not export
  assertRejects(
    'unknown host symbol',
    checkHostSymbols('import { definitelyNotExported } from "@indramesh/plugin-api";\nexport default 1;', CLEAN_HOST_EXPORTS),
  )

  // 7. a missing contribution family (only one of the three registered)
  assertRejects(
    'missing contribution family',
    checkRegistration('export default { translationPanelActions: [] };\n'),
  )

  // 8. absolute plugin API path (doubles the host /api/v1 prefix)
  assertRejects(
    'absolute plugin API path',
    findImportViolations('const api = "/api/v1/plugins/ai-translation/ui/candidates";\nexport default 1;\n').filter((v) =>
      v.includes('absolute plugin API path'),
    ),
  )

  // 9. a missing scoped style root
  assertRejects(
    'missing scoped style root',
    checkLocalesAndStyles('const x = 1;', { en: '', de: 'x', es: 'x', fr: 'x', pt: 'x' }),
  )

  // clean control passes every detector
  const cleanProblems = [
    ...findImportViolations(CLEAN_CONTROL),
    ...checkRegistration(CLEAN_CONTROL),
    ...checkStyleAsset(['ai-translation.js']),
    ...checkHostSymbols(CLEAN_CONTROL, CLEAN_HOST_EXPORTS),
    ...checkLocalesAndStyles(CLEAN_CONTROL, CLEAN_LABELS),
  ]
  if (cleanProblems.length > 0) {
    throw new Error(`self-test: the clean control was rejected: ${cleanProblems.join('; ')}`)
  }
}

// ── real bundle check ────────────────────────────────────────────────────────

function main() {
  const problems = []

  if (!existsSync(BUNDLE_FILE)) problems.push(`missing bundle output: ${BUNDLE_FILE}`)

  if (existsSync(STATIC_DIR)) {
    problems.push(...checkStyleAsset(readdirSync(STATIC_DIR)))
  }

  if (existsSync(BUNDLE_FILE)) {
    const code = readFileSync(BUNDLE_FILE, 'utf8')
    problems.push(...findImportViolations(code).map((v) => `registration bundle: ${v}`))
    problems.push(...checkRegistration(code))
    const hostExports = readHostExports()
    if (hostExports) {
      problems.push(...checkHostSymbols(code, hostExports).map((v) => `registration bundle: ${v}`))
    }
    problems.push(...checkLocalesAndStyles(code, readLocaleLabels()).map((v) => `registration bundle: ${v}`))
  }

  if (problems.length > 0) {
    console.error('verify-bundle: FAILED')
    for (const problem of problems) console.error(` - ${problem}`)
    process.exit(1)
  }

  console.log(
    'verify-bundle: OK — one self-contained ES bundle (host-only imports, three contribution families, five locales, three scoped styles, relative API paths, no separate CSS/chunk)',
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runSelfTest()
  } catch (error) {
    console.error('verify-bundle: FAILED (self-test)')
    console.error(` - ${error.message}`)
    process.exit(1)
  }
  main()
}
