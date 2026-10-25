import { Fragment, useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, Cloud, ExternalLink, LoaderCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import type { CloudAgentSchedule } from '../../../../shared/cloud-agent-provider'
import { getCloudAgentProvider } from '../../../../shared/cloud-agent-provider-registry'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LIST_TABLE_ROW_CLASS, LIST_TABLE_STICKY_ROW_CELL_CLASS } from '@/lib/list-table-layout'
import { translate } from '@/i18n/i18n'
import { AUTOMATIONS_TABLE_GRID_CLASS } from './automations-table-layout'
import { AutomationListStatusCell } from './AutomationListStatusCell'
import { formatExternalDate } from './external-automation-display'
import { useCloudScheduleRuns, useCloudSchedulesFeed } from './use-cloud-schedules'

/**
 * Vendor-owned schedules listed beside Orca's own automations. Read-only: the vendor runs
 * them, Orca shows the cadence, the next runs, and links each run to the session it spawned.
 */
export function CloudScheduleRows({
  relativeNow,
  onPresence
}: {
  relativeNow: number
  /** Lets the list suppress its "no automations" empty view when these rows exist. */
  onPresence?: (present: boolean) => void
}): React.JSX.Element | null {
  const feed = useCloudSchedulesFeed(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const present = feed.configured === true && (feed.schedules.length > 0 || feed.failure !== null)
  useEffect(() => {
    onPresence?.(present)
  }, [onPresence, present])
  if (!present) {
    return null
  }
  return (
    <>
      {feed.failure ? (
        <p className="px-3 py-2 text-xs text-muted-foreground" data-cloud-schedules="failed">
          {feed.failure.message}
        </p>
      ) : null}
      {feed.schedules.map((schedule) => (
        <Fragment key={schedule.id}>
          <CloudScheduleRow
            schedule={schedule}
            relativeNow={relativeNow}
            expanded={expandedId === schedule.id}
            onToggle={() =>
              setExpandedId((current) => (current === schedule.id ? null : schedule.id))
            }
          />
          {expandedId === schedule.id ? (
            <CloudScheduleDetailPanel schedule={schedule} relativeNow={relativeNow} />
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

function CloudScheduleRow({
  schedule,
  relativeNow,
  expanded,
  onToggle
}: {
  schedule: CloudAgentSchedule
  relativeNow: number
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const provider = getCloudAgentProvider(schedule.provider)
  const providerLabel = provider?.shortLabel ?? schedule.provider
  const cadence = schedule.cronExpression
    ? schedule.timezone
      ? `${schedule.cronExpression} · ${schedule.timezone}`
      : schedule.cronExpression
    : '—'
  const nextRun = schedule.upcomingRunsAt[0] ?? null
  const active = schedule.status === 'active'
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      data-cloud-schedule={schedule.id}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      className={cn(AUTOMATIONS_TABLE_GRID_CLASS, LIST_TABLE_ROW_CLASS)}
    >
      <span
        className={LIST_TABLE_STICKY_ROW_CELL_CLASS}
        title={schedule.promptPreview ?? undefined}
      >
        <ChevronRight
          className={cn(
            'mr-1 size-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <span className="min-w-0 truncate font-medium">{schedule.name}</span>
      </span>
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={cadence}>
        {cadence}
      </span>
      {/* Why: this column is the schedule's project; a prompt preview here read as nonsense
          next to the other rows. The environment is the closest real analogue. */}
      <span className="min-w-0 truncate text-muted-foreground" title={schedule.environmentId ?? ''}>
        {schedule.environmentName ?? '—'}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground">
        <Cloud className="size-3.5 shrink-0" />
        {translate('auto.components.automations.cloud.schedule.host', 'Cloud')}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">
        {active
          ? formatExternalDate(nextRun, relativeNow)
          : (schedule.pausedReason ??
            translate('auto.components.automations.AutomationsPage.paused', 'Paused'))}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">
        {formatExternalDate(schedule.lastRunAt, relativeNow)}
      </span>
      <AutomationListStatusCell enabled={active} />
      <span className="truncate text-center text-xs text-muted-foreground">{providerLabel}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7"
        aria-label={translate(
          'auto.components.automations.cloud.schedule.openConsole',
          'Open {{value0}} in the provider console',
          { value0: schedule.name }
        )}
        onClick={(event) => {
          event.stopPropagation()
          void window.api.shell.openUrl(schedule.url)
        }}
      >
        <ExternalLink className="size-3.5" />
      </Button>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">{value}</span>
    </div>
  )
}

/**
 * What the row cannot say in one line: the full prompt, the next runs, and the run history
 * with a link into the session each run spawned. Read-only — the vendor owns this schedule.
 */
function CloudScheduleDetailPanel({
  schedule,
  relativeNow
}: {
  schedule: CloudAgentSchedule
  relativeNow: number
}): React.JSX.Element {
  const runs = useCloudScheduleRuns(schedule.id)
  const setOpenCloudSessionId = useAppStore((s) => s.setOpenCloudSessionId)
  const nextRuns = schedule.upcomingRunsAt.slice(0, 3)

  return (
    <div
      className="space-y-3 border-l-2 border-border/60 bg-muted/20 px-4 py-3 text-xs"
      data-cloud-schedule-runs={schedule.id}
    >
      <dl className="space-y-1">
        <DetailRow
          label={translate('auto.components.automations.cloud.detail.schedule', 'Schedule')}
          value={
            schedule.cronExpression
              ? `${schedule.cronExpression}${schedule.timezone ? ` · ${schedule.timezone}` : ''}`
              : '—'
          }
        />
        <DetailRow
          label={translate('auto.components.automations.cloud.detail.agent', 'Agent')}
          value={
            schedule.agentId
              ? `${schedule.agentId}${schedule.agentVersion !== null ? ` · v${schedule.agentVersion}` : ''}`
              : '—'
          }
        />
        <DetailRow
          label={translate('auto.components.automations.cloud.detail.environment', 'Environment')}
          value={schedule.environmentName ?? schedule.environmentId ?? '—'}
        />
        {nextRuns.length > 0 ? (
          <DetailRow
            label={translate('auto.components.automations.cloud.detail.nextRuns', 'Next runs')}
            value={nextRuns.map((at) => formatExternalDate(at, relativeNow)).join('  ·  ')}
          />
        ) : null}
      </dl>

      {schedule.prompt ? (
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {translate('auto.components.automations.cloud.detail.prompt', 'Prompt')}
          </p>
          <p className="max-h-40 overflow-y-auto scrollbar-sleek whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/60 px-2.5 py-2 text-foreground/90">
            {schedule.prompt}
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-muted-foreground">
          {translate('auto.components.automations.cloud.detail.runs', 'Recent runs')}
        </p>
        {runs.loading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : runs.failure ? (
          <p className="text-muted-foreground">{runs.failure.message}</p>
        ) : runs.runs.length === 0 ? (
          <p className="text-muted-foreground">
            {translate('auto.components.automations.cloud.schedule.noRuns', 'No runs yet.')}
          </p>
        ) : (
          <ul className="space-y-1">
            {runs.runs.map((run) => (
              <li key={run.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
                  {formatExternalDate(run.scheduledAt ?? run.createdAt, relativeNow)}
                </span>
                {run.error ? (
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {run.error}
                  </span>
                ) : null}
                {run.sessionId ? (
                  <button
                    type="button"
                    className="truncate text-primary underline-offset-2 hover:underline"
                    onClick={() => setOpenCloudSessionId(run.sessionId)}
                  >
                    {translate(
                      'auto.components.automations.cloud.schedule.openSession',
                      'Open session'
                    )}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
