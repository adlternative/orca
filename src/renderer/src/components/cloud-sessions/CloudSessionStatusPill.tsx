import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { cn } from '@/lib/utils'

function statusPillClass(state: 'working' | 'blocked' | 'idle' | 'unknown'): string {
  switch (state) {
    case 'blocked':
      return 'border-agent-question/30 bg-agent-question/10 text-agent-question-text'
    case 'working':
      return 'border-border bg-muted/40 text-foreground'
    case 'idle':
      return 'border-status-success-border bg-status-success-background text-status-success'
    case 'unknown':
      return 'border-border bg-muted/40 text-muted-foreground'
  }
}

export function CloudSessionStatusPill(props: {
  statusWord: string | null
  working: boolean
  state: 'working' | 'blocked' | 'idle' | 'unknown'
}): React.JSX.Element | null {
  const { statusWord, working, state } = props
  if (statusWord === null) {
    return null
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        statusPillClass(state)
      )}
    >
      {working ? <AgentWorkingSpinner className="size-2" /> : null}
      {statusWord}
    </span>
  )
}
