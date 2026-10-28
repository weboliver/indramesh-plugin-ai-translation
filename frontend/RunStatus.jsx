// Phase 307 (AITR-02/03, S2/S3): the shared, honest run status/summary block.
//
// One surface shows one run at a time. It renders a queued/indeterminate state,
// a determinate running state with a real progress bar, or a terminal summary —
// from the plugin's own safe status projection. Counters are the entity/text
// units of that projection; the "items"/"texts" noun in every locale names
// exactly what the server persists and counts.
import { Link } from 'react-router-dom'
import {
  LucideIcon,
  interpolateDefault,
  useCan,
  useFormatDateTime,
  usePluginTranslation,
} from '@indramesh/plugin-api'

import { runOutcomeView } from './translation-state.js'

const PLUGIN_NAME = 'ai-translation'

// Fixed English defaults so a missing catalog entry still renders safe copy.
const DEFAULTS = {
  schema: {
    queued: {
      title: 'Translation queued',
      body: 'The run starts shortly. You can leave this page.',
    },
    running: {
      title: 'Translation running',
      body: '{{processed}} of {{total}} items processed. You can leave this page; the run continues.',
    },
    finished: {
      title: 'Last run finished',
      body: '{{generated}} suggestions created, {{skipped}} items skipped. Review and save them in the list below.',
    },
    partial: {
      title: 'Last run partly finished',
      body: '{{generated}} suggestions created; {{failed}} items could not be translated. Review the created suggestions in the list below. Start again to retry the rest.',
    },
    provider_stop: {
      title: 'Last run stopped',
      body: 'The AI service was unavailable after {{processed}} of {{total}} items. {{generated}} suggestions created before that are kept. Try again later.',
    },
    cancelled: {
      title: 'Last run cancelled',
      body: 'Cancelled after {{processed}} of {{total}} items. {{generated}} suggestions created before cancelling are kept.',
    },
    failed: {
      title: 'Last run failed',
      body: 'The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again.',
    },
  },
  admin: {
    queued: {
      title: 'Translation queued',
      body: 'The run starts shortly. You can change the filter or leave this page; the run continues.',
    },
    running: {
      title: 'Translating {{language}}',
      body: '{{processed}} of {{total}} texts processed. You can change the filter or leave this page; the run continues.',
    },
    finished: {
      title: 'Last run finished',
      body: '{{generated}} suggestions created, {{skipped}} texts skipped. Review them in the translation table.',
    },
    partial: {
      title: 'Last run partly finished',
      body: '{{generated}} suggestions created; {{failed}} texts could not be translated. Start again to retry the rest.',
    },
    provider_stop: {
      title: 'Last run stopped',
      body: 'The AI service was unavailable after {{processed}} of {{total}} texts. {{generated}} suggestions created before that are kept. Try again later.',
    },
    cancelled: {
      title: 'Last run cancelled',
      body: 'Cancelled after {{processed}} of {{total}} texts. {{generated}} suggestions created before cancelling are kept.',
    },
    failed: {
      title: 'Last run failed',
      body: 'The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again.',
    },
  },
}

function values(view, languageName) {
  return {
    processed: view.processed,
    total: view.total ?? view.processed,
    generated: view.generated,
    skipped: view.skipped,
    failed: view.failed,
    language: languageName,
  }
}

// The task log only helps when something went wrong; a clean run links nowhere.
const TASK_LINK_OUTCOMES = new Set(['partial', 'provider_stop', 'failed'])

export default function RunStatus({ run, surface = 'schema', languageName = '', openCount = null }) {
  const { t } = usePluginTranslation(PLUGIN_NAME)
  const canReadTasks = useCan('tasks', 'read')
  const formatDateTime = useFormatDateTime()

  const view = runOutcomeView(run)
  const copy = DEFAULTS[surface] ?? DEFAULTS.schema
  const fallback = copy[view.key] ?? copy.running
  const prefix = surface === 'admin' ? 'admin.run' : 'schema.run'
  const scope = values(view, languageName)

  const title = interpolateDefault(
    t(`${prefix}.${view.key}.title`, fallback.title),
    scope,
  )
  // Once every suggestion of the schema is reviewed, "review them below" would
  // point at an empty list.
  const allReviewed =
    surface === 'schema' && openCount === 0 && view.generated > 0 &&
    (view.key === 'finished' || view.key === 'partial')
  const body = allReviewed
    ? interpolateDefault(
        t('schema.run.reviewed.body', '{{generated}} suggestions created. All of them have been reviewed.'),
        scope,
      )
    : interpolateDefault(
        t(`${prefix}.${view.key}.body`, fallback.body),
        scope,
      )

  const titleClass =
    view.tone === 'error' ? 'aitr-run-title aitr-run-title-error' : 'aitr-run-title'

  return (
    <div className="aitr-run" data-testid={`plugin-ai-translation-run-${surface}`}>
      <p className={titleClass} role="status" aria-live="polite">
        <LucideIcon name={view.icon} className="aitr-run-icon" aria-hidden="true" />
        {title}
      </p>
      <p className="aitr-run-body">{body}</p>

      {view.determinate && (view.key === 'running' || view.key === 'queued') && (
        <div
          className="aitr-run-bar"
          role="progressbar"
          aria-valuenow={view.processed}
          aria-valuemin={0}
          aria-valuemax={view.total}
          data-testid={`plugin-ai-translation-run-bar-${surface}`}
        >
          <span
            className="aitr-run-bar-fill"
            style={{ width: `${Math.min(100, Math.round((view.processed / view.total) * 100))}%` }}
          />
        </div>
      )}

      {view.startedAt && (
        <p className="aitr-run-started">
          {interpolateDefault(t('run.started', 'Started {{datetime}}'), {
            datetime: formatDateTime(view.startedAt),
          })}
        </p>
      )}

      {view.taskId && canReadTasks && TASK_LINK_OUTCOMES.has(view.key) && (
        <Link className="aitr-run-link" to={`/tasks/${view.taskId}`} data-testid={`plugin-ai-translation-task-link-${surface}`}>
          {t('run.task_link', 'Open task details')}
        </Link>
      )}
    </div>
  )
}
