import { CheckCircle2, XCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { getCloudAgentProvider } from '../../../../shared/cloud-agent-provider-registry'
import { cloudSessionTitle, rememberCloudSessionRow } from './use-cloud-sessions-feed'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'

/** Words for a states the dot alone cannot carry: blocked, stale, and an unreadable stream. */
export function stateLabel(session: CloudAgentSessionRow, stale: boolean): string {
  if (stale) {
    // Why: silence is never evidence a cloud turn ended (ssh-execution-boundary vocabulary).
    return translate('auto.components.sidebar.cloud.sessions.state.unverifiable', 'Unverifiable')
  }
  switch (session.state) {
    case 'blocked':
      return translate('auto.components.sidebar.cloud.sessions.state.blocked', 'Needs approval')
    case 'working':
      return translate('auto.components.sidebar.cloud.sessions.state.working', 'Working')
    case 'idle':
      return translate('auto.components.sidebar.cloud.sessions.state.idle', 'Idle')
    case 'ended':
      return translate('auto.components.sidebar.cloud.sessions.state.ended', 'Ended')
    case 'unverifiable':
      return translate('auto.components.sidebar.cloud.sessions.state.unverifiable', 'Unverifiable')
  }
}

function OutcomeGlyph({ result }: { result: string | undefined }): React.JSX.Element | null {
  if (result === 'satisfied') {
    return (
      <CheckCircle2
        aria-label={translate('auto.components.sidebar.cloud.sessions.outcome.met', 'Criteria met')}
        className="size-3 shrink-0 text-status-success"
      />
    )
  }
  if (result === 'max_iterations_reached' || result === 'failed') {
    return (
      <XCircle
        aria-label={translate(
          'auto.components.sidebar.cloud.sessions.outcome.notMet',
          'Criteria not met'
        )}
        className="size-3 shrink-0 text-agent-question-text"
      />
    )
  }
  return null
}

export function CloudSessionRow(props: {
  session: CloudAgentSessionRow
  stale: boolean
  /** True when another visible row carries the same title. */
  disambiguate?: boolean
}): React.JSX.Element {
  const { session, stale, disambiguate = false } = props
  const provider = getCloudAgentProvider(session.provider)
  const providerLabel = provider?.shortLabel ?? session.provider
  const setOpenCloudSessionId = useAppStore((s) => s.setOpenCloudSessionId)
  const isOpen = useAppStore(
    (s) => s.openCloudSessionId === session.id && s.openCloudSessionProvider === session.provider
  )
  const working = session.state === 'working' && !stale
  const blocked = session.state === 'blocked' && !stale
  const untitled = translate('auto.components.sidebar.cloud.sessions.untitled', 'Untitled session')
  // Why: the vendor leaves drafts unnamed, so three rows read "Untitled session" and there is
  // no way to tell which one to open — the id tail is the only stable handle.
  // The first prompt the drawer saw stands in for a name the vendor never set.
  const provisional = session.title ? null : cloudSessionTitle(session.id, session.provider)
  const base = session.title ?? provisional
  const title = base
    ? disambiguate
      ? `${base} · ${session.id.slice(-4)}`
      : base
    : `${untitled} · ${session.id.slice(-4)}`

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={translate(
              'auto.components.sidebar.cloud.sessions.openSession',
              'Open {{value0}} ({{value1}})',
              { value0: `${providerLabel}: ${title}`, value1: stateLabel(session, stale) }
            )}
            aria-pressed={isOpen}
            data-cloud-session-row={session.id}
            data-cloud-session-provider={session.provider}
            data-cloud-session-state={session.state}
            data-cloud-session-updated={session.updatedAt ?? session.createdAt ?? ''}
            onClick={() => {
              // Why: the drawer reads its header from the feed snapshot, and a row found by
              // search may not be in that page — seed it so the title survives the click.
              rememberCloudSessionRow(session)
              setOpenCloudSessionId(session.id, session.provider)
            }}
            className={cn(
              'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring focus-visible:outline-none',
              isOpen && 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
            )}
          >
            <span className="flex size-3 shrink-0 items-center justify-center">
              {working ? (
                <AgentWorkingSpinner className="size-2.5" />
              ) : (
                <span
                  className={cn(
                    'block size-2 rounded-full',
                    stale || session.state === 'unverifiable'
                      ? 'border border-muted-foreground/60'
                      : blocked
                        ? 'bg-agent-question'
                        : session.state === 'idle'
                          ? 'bg-status-success'
                          : 'bg-muted-foreground/40'
                  )}
                />
              )}
            </span>
            {/* Why: 13px, like the project rows beside it — 12px made this group read tighter. */}
            <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{providerLabel}</span>
            {/* Why: the blocked dot is the same shape as the idle one, so colour alone carried the
                one state that needs a human — spell it out. */}
            {blocked ? (
              <span className="shrink-0 text-[11px] font-medium text-agent-question-text">
                {stateLabel(session, stale)}
              </span>
            ) : null}
            <OutcomeGlyph result={session.outcome?.result} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-72">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">
            {/* Why the provider: two vendors share one list, so the tooltip has to say whose
                session this is before it says anything about its state. */}
            {provider?.label ?? session.provider} · {stateLabel(session, stale)} ·{' '}
            {formatRelativeTime(Date.parse(session.updatedAt ?? session.createdAt ?? '') || 0)}
          </p>
          <p className="text-muted-foreground">{session.id}</p>
        </TooltipContent>
      </Tooltip>
    </li>
  )
}
