import { useState } from 'react'
import {
  ChevronDown,
  Cloud,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import { listCloudAgentProviders } from '../../../../shared/cloud-agent-provider-registry'
import { NewCloudSessionDialog } from '@/components/cloud-sessions/NewCloudSessionDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { cloudAgentFailureCopy, providerLabel } from '../cloud-sessions/cloud-agent-failure-copy'
import { CloudSessionRow } from './CloudSessionRow'
import { selectVisibleSessions } from './cloud-sessions-visible'
import { useCloudSessionsFeed } from './use-cloud-sessions-feed'
import { useCloudSessionSearch } from '@/components/cloud-sessions/use-cloud-session-search'
import { Input } from '@/components/ui/input'

/**
 * Sidebar group for agent sessions that run in a vendor cloud, not on any Orca host.
 * Newest activity first; the dot carries the state so forty rows do not shout at once.
 */
/** Rows kept in view before the older tail folds behind one expander. */
const VISIBLE_LIMIT = 8

export function CloudSessionsSection(): React.JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const feed = useCloudSessionsFeed(true)
  const search = useCloudSessionSearch(query, searchOpen)

  // Why: an unconfigured integration must not reserve sidebar space; Settings advertises it.
  // Declared after every hook so the hook order never depends on the credential state.
  if (feed.configured !== true) {
    return null
  }

  const searching = !search.inactive
  const stale = feed.failure !== null && feed.sessions.length > 0
  // Why: with several vendors in one list, the mix is invisible — a chatty account looked like the
  // only one connected. These counts double as the filter, so the row that explains the mix is also
  // the control that narrows it.
  const providerTally = feed.sessions.reduce<Map<string, number>>((tally, session) => {
    tally.set(session.provider, (tally.get(session.provider) ?? 0) + 1)
    return tally
  }, new Map())
  const unfiltered = searching ? search.rows : feed.sessions
  const providers = listCloudAgentProviders().filter(
    (provider) => feed.configuredProviders.includes(provider.id) || providerTally.has(provider.id)
  )
  const activeProvider = providers.some((provider) => provider.id === selectedProvider)
    ? selectedProvider
    : null
  const source = unfiltered.filter(
    (session) => !activeProvider || session.provider === activeProvider
  )
  const blockedCount = source.filter((session) => session.state === 'blocked').length
  // Why: a call waiting on a human is never trimmed by the fold — 18 approvals once sat behind
  // it, invisible. Order stays strictly by time; this only stops the fold hiding the ones that
  // need an answer.
  const visible = searching ? source : selectVisibleSessions(source, showAll, VISIBLE_LIMIT)
  const hiddenCount = searching ? 0 : source.length - visible.length
  // Titles the vendor repeats would otherwise give two rows the same label.
  const collidingTitles = (() => {
    const seen = new Map<string, number>()
    for (const session of visible) {
      if (session.title) {
        seen.set(session.title, (seen.get(session.title) ?? 0) + 1)
      }
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([title]) => title))
  })()

  // Why: the approvals that need a human sat behind the fold, so the count that says so also
  // expands the list and parks the first one in view.
  const revealBlocked = (): void => {
    setShowAll(true)
    window.requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>('[data-cloud-session-state="blocked"]')
      if (first) {
        first.scrollIntoView({ block: 'nearest' })
        first.focus({ preventScroll: true })
      }
    })
  }

  return (
    <section
      data-cloud-sessions-section=""
      // Why: share leftover height with the project list instead of a fixed cap.
      className="flex min-h-0 max-h-[45%] shrink-0 flex-col border-t border-worktree-sidebar-border text-worktree-sidebar-foreground"
    >
      {/* Why: px-4 lines the group title up with the row titles below it (px-2 + dot column). */}
      <div className="flex items-center gap-1.5 px-4 pt-1.5 pb-0.5">
        <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
        {/* Why: text-xs, like every other sidebar group title (项目 uses the same 12px). */}
        <div className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">
          {translate('auto.components.sidebar.cloud.sessions.title', 'Cloud sessions')}
        </div>
        {searching ? null : blockedCount > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={revealBlocked}
                // Why: the trigger was a bare number, so a screen reader got "18" with nothing
                // saying 18 of what — the tooltip text is hover-only, and it also did nothing.
                aria-label={translate(
                  'auto.components.sidebar.cloud.sessions.needYou',
                  '{{value0}} need you',
                  { value0: String(blockedCount) }
                )}
                className="flex min-h-6 shrink-0 items-center rounded-full bg-agent-question/15 px-2 text-[11px] font-medium tabular-nums text-agent-question-text transition-colors hover:bg-agent-question/25"
              >
                {blockedCount}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.sidebar.cloud.sessions.needYou', '{{value0}} need you', {
                value0: String(blockedCount)
              })}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {feed.hasMore ? `${source.length}+` : source.length}
          </span>
        )}
        {searchOpen ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSearchOpen(true)}
                aria-label={translate(
                  'auto.components.sidebar.cloud.sessions.search',
                  'Search cloud sessions'
                )}
              >
                <Search />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.sidebar.cloud.sessions.search', 'Search cloud sessions')}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCreateOpen(true)}
              aria-label={translate('cloudTasks.newTask', 'New cloud task')}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('cloudTasks.newTask', 'New cloud task')}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'auto.components.sidebar.cloud.sessions.moreActions',
                'More cloud session actions'
              )}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={feed.refresh}>
              <RefreshCw />
              {translate('auto.components.sidebar.cloud.sessions.refresh', 'Refresh')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {providers.map((provider) => (
              <DropdownMenuItem
                key={provider.id}
                onSelect={() => window.api.shell.openUrl(provider.consoleUrl)}
              >
                <ExternalLink />
                {translate(
                  'auto.components.sidebar.cloud.sessions.openConsole',
                  'Open {{provider}} console',
                  { provider: provider.shortLabel }
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={translate(
            'auto.components.sidebar.cloud.sessions.toggle',
            'Toggle cloud sessions'
          )}
          onClick={() => setCollapsed((value) => !value)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
        </button>
      </div>
      {collapsed ? null : (
        <div className="min-h-0 flex-1 overflow-y-auto worktree-sidebar-scrollbar px-2 pb-2">
          {providers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
              {providers.length > 1 ? (
                <Button
                  variant={activeProvider === null ? 'secondary' : 'ghost'}
                  size="xs"
                  aria-pressed={activeProvider === null}
                  onClick={() => setSelectedProvider(null)}
                >
                  {translate('auto.components.sidebar.cloud.sessions.allProviders', 'All')}
                </Button>
              ) : null}
              {providers.map((provider) => {
                const label = provider.shortLabel
                return (
                  <Button
                    key={provider.id}
                    variant={activeProvider === provider.id ? 'secondary' : 'ghost'}
                    size="xs"
                    aria-pressed={activeProvider === provider.id}
                    aria-label={translate(
                      'auto.components.sidebar.cloud.sessions.filterProvider',
                      'Show only {{provider}} sessions',
                      { provider: label }
                    )}
                    onClick={() => setSelectedProvider(provider.id)}
                  >
                    {label} {providerTally.get(provider.id) ?? 0}
                  </Button>
                )
              })}
            </div>
          ) : null}
          {searchOpen ? (
            <div className="flex items-center gap-1 px-0.5 pb-1">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setQuery('')
                    setSearchOpen(false)
                  }
                }}
                placeholder={translate(
                  'auto.components.sidebar.cloud.sessions.searchPlaceholder',
                  'Title or session id'
                )}
                aria-label={translate(
                  'auto.components.sidebar.cloud.sessions.search',
                  'Search cloud sessions'
                )}
                className="h-7"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setQuery('')
                  setSearchOpen(false)
                }}
                aria-label={translate(
                  'auto.components.sidebar.cloud.sessions.clearSearch',
                  'Close search'
                )}
              >
                <X />
              </Button>
            </div>
          ) : null}
          {searching && search.loading ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              {translate('auto.components.sidebar.cloud.sessions.searching', 'Searching…')}
            </p>
          ) : searching && visible.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              {translate('auto.components.sidebar.cloud.sessions.noMatch', 'No session matches.')}
            </p>
          ) : null}
          {feed.failure && feed.sessions.length === 0 ? (
            <div className="flex items-start gap-1 px-1 py-1">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {cloudAgentFailureCopy(feed.failure, providerLabel(feed.failureProvider))}
              </p>
              {/* Why: a failed first read left the group with a message and nothing to act on. */}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={feed.refresh}
                aria-label={translate('auto.components.sidebar.cloud.sessions.retry', 'Try again')}
              >
                <RefreshCw />
              </Button>
            </div>
          ) : source.length === 0 && !searching && feed.lastFetchedAt !== null ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              {translate(
                'auto.components.sidebar.cloud.sessions.empty',
                'No active cloud sessions.'
              )}
            </p>
          ) : null}
          {visible.length > 0 ? (
            <ul className="space-y-0.5">
              {visible.map((session) => (
                <CloudSessionRow
                  key={`${session.provider}:${session.id}`}
                  session={session}
                  stale={stale}
                  // Why: the vendor hands out repeated titles (three drafts all called
                  // "builder-test draft-…"), so colliding rows get an id tail to tell apart.
                  disambiguate={collidingTitles.has(session.title ?? '')}
                />
              ))}
            </ul>
          ) : null}
          {searching && search.truncated ? (
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.cloud.sessions.searchTruncated',
                'Searched the newest sessions only; refine the query to narrow it.'
              )}
            </p>
          ) : null}
          {hiddenCount > 0 || showAll ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground"
            >
              {showAll
                ? translate('auto.components.sidebar.cloud.sessions.showFewer', 'Show fewer')
                : [
                    translate(
                      'auto.components.sidebar.cloud.sessions.showMore',
                      'Show {{value0}} more',
                      { value0: String(hiddenCount) }
                    )
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </button>
          ) : null}
          {stale ? (
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.cloud.sessions.stale',
                'Showing the last known state. {{reason}}',
                {
                  reason: feed.failure
                    ? cloudAgentFailureCopy(feed.failure, providerLabel(feed.failureProvider))
                    : ''
                }
              )}
            </p>
          ) : null}
        </div>
      )}
      {createOpen ? <NewCloudSessionDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </section>
  )
}
