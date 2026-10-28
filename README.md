# ai-translation plugin

The plugin owns **AI-assisted translation suggestions** for schema data and UI strings. It serves
its own suggestion API through the Core route-injection contract, keeps every proposal in a
**private** plugin table on its own Alembic chain, and runs the two bulk jobs as observable Core
Task types. Manual data/UI translation, the language/fallback rules and the UI catalog stay
Core-owned and keep working with this plugin disabled.

- Manifest: `plugin.toml` (`capabilities = ["api_routes", "task_type"]`, `active_by_default = true`).
- Backend: `module.py` (module) → `routes.py` (HTTP surface) → `planning.py` / `generation.py` /
  `suggestions.py` / `runs.py` / `safety.py` / `admission.py` / `tasks.py`.
- Frontend: `frontend/index.jsx` registers exactly three host contributions and five language
  catalogs; `AdminAction.jsx` is the UI-language admin action.
- Committed artifact: `static/ai-translation.js` — one host-only ES module.
- Migrations: `migrations/0001_suggestions.py` → `migrations/0002_runs.py` on the private
  `alembic_version_ai_translation` chain.

The plugin imports only the public `indramesh.sdk` surface on the backend (Core's import-policy
failure gate refuses a plugin that reaches into Core internals) and only host-singleton identity
re-exports on the frontend.

## Install

The plugin is distributed as its own repository and installed into a running IndraMesh Core stack.
**Requires IndraMesh Core 1.0.0 or later** (plugin API `1.0.0`). It is a read-only mirror of the
maintainer's develop repository, so it is **not standalone buildable** today — the plugin SDK ships
in a later release; the committed bundle in this repository is the supported distribution format.

**Compose stack** — from the Core checkout root:

```bash
./install_plugin_docker.sh https://github.com/weboliver/indramesh-plugin-ai-translation
```

The script clones the repository, copies the plugin to `<core>/plugins/ai-translation` and restarts
`backend` and `worker` so the plugin registry re-scans. The destination directory name comes from
the plugin's own manifest; a second argument overrides it only if you deliberately want a different
name. The same command accepts a local directory instead of the URL.

**Local k3s stack** — from the Core checkout root, with a kubeconfig for the cluster
(`KUBECONFIG=$HOME/.kube/config` when it is not already at the default location):

```bash
./install_plugin_k8s.sh https://github.com/weboliver/indramesh-plugin-ai-translation
```

The script copies the plugin directory onto the plugins PVC, runs the private migration in the live
backend, then restarts `backend` and `worker` so the registry re-scans. A URL source accepts an
optional ref (tag or branch) as a further argument; without one the default branch is installed.

**Kubernetes networking.** This plugin answers through the Core route contract and calls the
configured LLM endpoint for its generation runs. With the default chart values the backend and worker
may reach public addresses on port 443, so a hosted provider works without further steps. A provider
on a private address or on another port (a local Ollama or vLLM server, for example) needs an
explicit egress entry: the installer adds a private `LLM_BASE_URL` host by itself, and other targets
go into `K8S_EGRESS_ALLOW` in the `.env`. See *Outbound connections on Kubernetes* in the Core
`docs/CONFIGURATION.md`. Without a working route the plugin is still installed and **active** and its
panels appear, but a run stops at the first call with `reason=unreachable`, and the UI reports that
the AI service could not be reached. The Compose stack needs no such rule: it has ordinary outbound
network access.

**Manual equivalent:** copy the plugin directory to `<core>/plugins/ai-translation` yourself and
restart `backend` **and** `worker` — and run the plugin's migration yourself, because this plugin
owns a private database. Plugin discovery runs exactly once at process startup — there is no live
filesystem watch — so both processes must be restarted before the plugin is registered.

**Replacing an installed plugin:** both installers refuse an existing destination and neither offers
a way around that refusal. An installed plugin is replaced by removing its directory deliberately
first — `plugins/ai-translation` in a Compose checkout, the plugin's directory on the plugins PVC on
Kubernetes — and installing again. See **Installing and Updating Plugins** in the Core README for the removal commands, including the writable helper pod for the k3s case.

## Permissions and default grants

Two separate AI rights, declared insert-only on first discovery:

| Permission | Default roles | Grants |
|---|---|---|
| `ai-translation:data` | Administrator, Editor | Generate/review field and schema suggestions. |
| `ai-translation:ui` | Administrator | Generate/review UI-string suggestions. |

Viewer receives neither. A later administrative revoke is never reconciled or re-granted.

**Editor caveat.** `translations` is an admin-only Core resource in the shipped seed, so the seeded
**Editor** holds `ai-translation:data` but **no** `translations:read` / `translations:update`.
Data-AI therefore becomes usable for Editors only after an administrator grants the matching
translation read/update rights: the AI right alone never substitutes for the translation/entity
read or write right. Both bulk task types declare the Core translation read right as an
`admission_permissions` entry, so admission enforces it independently of the route gate.

## Configuration

- **No `[config_schema]`** — the plugin reads no plugin configuration; the two AI rights are
  manifest-declared permissions.
- **LLM:** all generation goes only through the Core provider-neutral LLM facade (`ctx.llm`),
  configured with `LLM_PROVIDER`/`LLM_MODEL`/`LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODE`. **No key =
  AI off:** with no working `LLM_*` configuration the generation controls are hidden and
  `/data/availability` / `/ui/candidates` report the unavailable state, while already-stored
  suggestions stay reviewable with the right permissions.
- The plugin adds no vendor client, key or provider default of its own.

## Frontend

Bundle `static/ai-translation.js` (one host-only ES module built with the host Vite toolchain);
extension points `translationPanelActions`, `translationAdminActions`, `schemaSettingsSections`;
five language catalogs and three scoped styles. No new page and no new nav item. See "Build and
verify" below.

## HTTP surface

Mounted under `/api/v1/plugins/ai-translation` (Core route-injection prefix, forced auth chain).
Every route additionally requires the matching AI permission.

| Route | Permission | Purpose |
|---|---|---|
| `GET /data/status?translation_type=&entity_id=` | `ai-translation:data` | `{available, open_count}` for one identity (LLM availability fails closed). |
| `GET /data/availability` | `ai-translation:data` | Whether a provider-neutral LLM is configured for this process. |
| `GET /data/open-count` | `ai-translation:data` | Open-suggestion count for a schema scope. |
| `GET /data/schema-candidates?schema_id=` | `ai-translation:data` | Missing translations per kind for the schema section (authorized entities only; how many already wait for review). |
| `GET /data/schema-suggestions?schema_id=` | `ai-translation:data` | Open suggestions of a schema for the review list (each row authorized; up to 100, `has_more` beyond). |
| `POST /data/generate` | `ai-translation:data` | Generate field suggestions for the reported empty pairs. |
| `GET /data/suggestions` | `ai-translation:data` | Read open suggestions for one identity. |
| `POST /data/apply` | `ai-translation:data` | Commit reviewed drafts with `fill_missing`. |
| `DELETE /data/suggestions/{id}` | `ai-translation:data` | Discard one data suggestion. |
| `GET /data/runs` | `ai-translation:data` | Latest schema run summary. |
| `GET /ui/status` | `ai-translation:ui` | Language-wide UI run status (independent of the filter). |
| `GET /ui/candidates` | `ai-translation:ui` | Eligible missing-text count for the current language/filter. |
| `GET /ui/runs` | `ai-translation:ui` | Latest UI run summary. |
| `GET /ui/suggestions` | `ai-translation:ui` | Open UI suggestions for the current language/filter. |
| `POST /ui/apply` | `ai-translation:ui` | Commit the displayed UI drafts with `fill_missing`. |
| `DELETE /ui/suggestions/{id}` | `ai-translation:ui` | Discard one UI suggestion (durable tombstone). |

A bare `GET /data/status` without both query parameters is a `422` and proves nothing; the evidence
checklist below uses a real disposable `entity_id`.

## Task types (hidden from the generic Create Task dialog)

Both are declared with `catalog_visible = false`, so they are absent from the **Create Task** type
picker only — the task list, type filter, direct start and retry remain complete. The AI rights and
the Core task permissions are the real gates.

### `ai-translation.schema-bulk`

- `required_permission`: `ai-translation:data`
- `scope_requirements`: `("schema_id",)` — the schema is the Core task scope; the only start
  parameter is the optional `translation_types` (1–6 unique values of `object_type`,
  `object_type_attribute`, `select_option`, `object_value`, `status`, `reference_type`); absent =
  all six kinds. Statuses and schema-bound reference types are included in a schema run. Never a
  fictitious `schema_id` parameter; `additionalProperties: false`.
- `admission_permissions`: `("translations:read", "schemas:read")`
- `steps`: `plan` → `translate` → `finish`

### `ai-translation.ui-bulk`

- `required_permission`: `ai-translation:ui`
- `admission_permissions`: `("translations:read",)`
- `steps`: `plan` → `translate` → `finish`
- Parameter shape (strict; a `namespace` together with `namespace_is_null: true` is rejected):

  ```json
  {
    "type": "object",
    "properties": {
      "target_language": {"type": "string", "minLength": 2, "maxLength": 10},
      "namespace": {"type": ["string", "null"], "maxLength": 255},
      "namespace_is_null": {"type": "boolean"},
      "q": {"type": ["string", "null"], "maxLength": 255}
    },
    "required": ["target_language"],
    "additionalProperties": false
  }
  ```

**409 semantics.** Admission rejects an overlapping start with `409`, not merely by disabling
browser buttons. A schema run locks further AI requests in the **same schema** (a field request for
the same entity is refused too), while other schemas may run in parallel. A UI run locks **per
target language, independent of the filter**, because the filter could otherwise overlap. Both the
pre-flight admission and a worker-side re-check cover queued/PENDING and RUNNING, simultaneous
admission, retry and crash recovery.

## Review and apply semantics

- Suggestions are stored as private rows; nothing is saved automatically.
- **Review** (load / discard / status) is plugin work. The Core panels and the catalog table keep
  their manual editors; Core imports no plugin suggestion model and does not call this API directly.
- **Apply is an explicit act.** The UI review block's **Apply translations** writes exactly the
  displayed, edited drafts; a UI run ending with suggestions never commits them by itself.
- Every AI commit is `fill_missing`: a target filled in the meantime is **skipped** and reported,
  never overwritten; valid drafts are still applied (no all-or-nothing), and no overwrite offer
  exists.
- **Outcomes:** isolated per-item failures finish the run as a **partial** result with real
  counters and safe reasons; a provider/connection outage ends the run. There are no fabricated
  progress values and never a blanket "fully successful".
- **Cancellation:** a deliberate Task cancel stops further processing and **keeps** the valid
  suggestions already stored; the task/summary shows the cancellation and the real completed count.
- **No-key review:** with the plugin active but no configured LLM, generation controls are hidden
  while already-existing suggestions stay reviewable with the right permissions.
- Error and summary bodies never include raw provider text, prompts, responses, HTTP `detail`
  bodies or keys. Invalid-draft reasons use fixed codes
  (`out_of_scope` / `empty` / `too_long` / `technical_key` / `placeholder_mismatch`) mapped to
  localized copy on the frontend.

## Private database

Two tables under the plugin namespace, migrated by the Core plugin runner as the restricted
`indramesh_plugin` role (see `docs/CONFIGURATION.md` in the Core repository):

| Table | Contents |
|---|---|
| `plugin_ai_translation_suggestions` | One proposal per field/language identity (plus the durable UI dismissal tombstone). |
| `plugin_ai_translation_runs` | One honest run summary per Task (`task_id` unique): counters and a safe outcome only, never proposal text. |

Natural-key partial unique indexes guard identity: exactly one **open** proposal per
`(translation_type, entity_id, field, language_code)` `WHERE status = 'pending'`, and one
**dismissed** UI key/language `WHERE status = 'dismissed' AND translation_type = 'systemui'`.

Core `translation_suggestions` is dropped by the Core revision `307_drop_translation_suggestions`
(drop-only, no data copy). Legacy ARQ job/status keys are removed once with
`python -m app.maintenance cleanup-legacy-translations` — see the rollout runbook in the Core
repository's `docs/DEPLOYMENT.md`.

## Build and verify

The bundle is built with the host Vite toolchain in the Core checkout — no plugin-local install and
no new dependency. With this plugin directory at `plugins/ai-translation`, from the Core repository
root:

```bash
npm --prefix frontend run build:plugin-ai-translation
# equivalent to: vite build --config ../plugins/ai-translation/frontend/vite.config.mjs
#             && node ../plugins/ai-translation/frontend/verify-bundle.mjs

# Fail-first self-test of the verifier itself (synthetic bad bundles must be rejected):
node plugins/ai-translation/frontend/verify-bundle.mjs --self-test
```

The verifier fails the build unless `static/ai-translation.js` is a **single self-contained ES**
module that imports only host singletons, has a default export, registers only the three
contribution families (`translationPanelActions`, `translationAdminActions`, `schemaSettingsSections`),
carries all five locales and its three scoped styles, uses relative API paths, and makes no separate
chunk/CSS/worker request.

The rebuilt `static/ai-translation.js` is committed in the Core source tree (never force-add
gitignored output: `.env`, `node_modules`, build scratch — the plugin directory carries source plus
the static bundle only and holds no credentials), and reaches an installed stack through a fresh
plugin install.

## Delivery (existing mechanisms — nothing new)

There is **no release or archive tooling** and no new service, task workflow, env key or network
exception.

### Kubernetes (existing operator installer)

Install it onto the shared plugins PVC with the existing root entrypoint:

```bash
# From the Core repository root, with the operator kubeconfig:
./install_plugin_k8s.sh https://github.com/weboliver/indramesh-plugin-ai-translation
```

`install_plugin_k8s.sh` copies the plugin directory onto the `plugins-storage` claim, runs the
private migration in the live backend, then restarts `backend` + `worker` so the registry re-scans.
A local directory is accepted in place of the URL.
It **deliberately refuses an existing destination** — a replacement needs explicit operator
approval, never a silent overwrite. See the rollout order in the Core repository's
`docs/DEPLOYMENT.md` (the credential caveat for restricted-role plugins applies).

### Manifest / default-active semantics

`plugin.toml` sets `active_by_default = true` and declares the two AI permissions with the default
roles above. These defaults are applied on **first discovery only** and are insert-only: an existing
disable, an existing grant row or a later administrative revocation is **never** re-applied or
reconciled.

## Runtime contract

- **Gates:** authentication + `plugin-runtime:use` + active state (Core mount chain) **and** the
  matching AI permission per route, **and** the Core translation read right at admission. The AI
  right is independent of the manual translation write right.
- **Provider-neutral:** generation goes only through `ctx.llm`. The plugin adds no vendor client,
  key or provider default. No key means AI off; errors are classified and secret-free.
- **Three surfaces, no new page:** `translationPanelActions` (field drafts in the existing panel),
  `schemaSettingsSections` (schema run + honest last-run overview), `translationAdminActions` (UI
  runs + explicit review/apply in the existing catalog table). No new nav item or dialog.

## Operator evidence checklist

Prove delivery against a real deployment **without** editing infrastructure:

1. **Core migration head** — `alembic current` shows the Core head (the drop-only
   `307_drop_translation_suggestions`).
2. **Private chain head** — `alembic_version_ai_translation` reads `0002_runs`.
3. **Registry state** — the plugin appears active in the Plugins admin page (or
   `GET /api/v1/plugins/ai-translation` with `plugins:read`) with no `database_error`.
4. **Status route** — an authenticated
   `GET /api/v1/plugins/ai-translation/data/status?translation_type=object_type&entity_id=<disposable ObjectType id>`
   returns `200` with `{available, open_count}`. A bare call without both parameters is `422` and
   proves nothing.
5. **Hidden task types** — the task-type catalog lists `ai-translation.schema-bulk` and
   `ai-translation.ui-bulk` with `catalog_visible=false` (absent from the Create Task picker).
6. **Legacy cleanup** — the one-shot `cleanup-legacy-translations` JSON report
   (`{ok, removed_jobs, removed_keys, skipped_undecodable, failed_tasks}`).

Disables and revocations are respected (never silently re-granted). A successful template parse, an
offline check or a Compose restart alone is never deployment evidence.

## Verification hygiene

- **Scoped verification only:** plugin backend tests use an LLM **stub**; frontend checks are fast
  unit/lint/build checks.
- **Disposable data:** any live create uses only data created for that step (a throwaway schema /
  ObjectType) and is cleaned up afterwards. Never touch user-authored schemas.
- **Honest limits:** retired AI copy was removed as catalog/seed **data**; remote PVC/discovery
  propagation and effective proxy health are recorded as pending operator evidence, never asserted
  as completed live checks.

## License

Apache-2.0 — see [`LICENSE`](LICENSE). The plugin bundles no third-party runtime code; the
committed bundle `static/ai-translation.js` is built from `plugins/ai-translation/frontend/` with
the Core repository's Vite toolchain.

## Status

This repository is a **read-only mirror** of the private develop repository: it is regenerated
from the Core source tree at release time, so issues and pull requests are applied upstream by
hand rather than merged here.
