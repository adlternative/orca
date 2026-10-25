import { Archive, Cloud, ExternalLink, MoreHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { CloudSessionStatusPill } from './CloudSessionStatusPill'

export function CloudSessionDrawerHeader(props: {
  title: string
  sessionId: string
  streamState: 'open' | 'reconnecting' | 'closed' | 'connecting' | 'off'
  statusWord: string | null
  working: boolean
  blocked: boolean
  state: 'working' | 'blocked' | 'idle' | 'unknown' | 'ended'
  consoleUrl: string | null
  canArchive: boolean
  archivePending: boolean
  onArchive: () => void
  onClose: () => void
}): React.JSX.Element {
  const { title, sessionId, streamState, statusWord, working, blocked, state } = props
  return (
    <header className="flex items-start gap-2 border-b border-worktree-sidebar-border px-3 py-2">
      <Cloud className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{sessionId}</span>
          {streamState === 'open' ? (
            <span className="shrink-0">
              · {translate('auto.components.cloud.sessions.drawer.live', 'live')}
            </span>
          ) : streamState === 'reconnecting' ? (
            <span className="shrink-0">
              · {translate('auto.components.cloud.sessions.drawer.reconnecting', 'reconnecting…')}
            </span>
          ) : null}
        </p>
      </div>
      <CloudSessionStatusPill
        statusWord={statusWord}
        working={working}
        state={blocked ? 'blocked' : working ? 'working' : state === 'idle' ? 'idle' : 'unknown'}
      />
      {props.consoleUrl ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'auto.components.cloud.sessions.drawer.actions',
                'Session actions'
              )}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => window.api.shell.openUrl(props.consoleUrl ?? '')}>
              <ExternalLink />
              {translate(
                'auto.components.cloud.sessions.drawer.openConsole',
                'Open in Qoder Cloud'
              )}
            </DropdownMenuItem>
            {props.canArchive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={props.onArchive}
                  disabled={props.archivePending}
                >
                  <Archive />
                  {translate('auto.components.cloud.sessions.drawer.archive', 'Archive session')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={props.onClose}
        aria-label={translate('auto.components.cloud.sessions.drawer.close', 'Close')}
      >
        <X />
      </Button>
    </header>
  )
}
