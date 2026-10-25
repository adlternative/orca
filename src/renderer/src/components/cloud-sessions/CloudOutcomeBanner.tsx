import { CheckCircle2, CircleDashed, LoaderCircle, Target, XCircle } from 'lucide-react'
import type { CloudOutcome } from '../../../../shared/cloud-agent-outcome'
import type { CloudAgentOutcomeResult } from '../../../../shared/cloud-agent-outcome-vocabulary'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type Tone = 'pending' | 'evaluating' | 'satisfied' | 'warning' | 'error'

function toneFor(result: CloudAgentOutcomeResult): Tone {
  switch (result) {
    case 'satisfied':
      return 'satisfied'
    case 'evaluating':
      return 'evaluating'
    case 'failed':
      return 'error'
    case 'max_iterations_reached':
    case 'interrupted':
    case 'needs_revision':
      return 'warning'
    case 'pending':
    case 'running':
      return 'pending'
  }
}

export function outcomeResultLabel(result: CloudAgentOutcomeResult): string {
  switch (result) {
    case 'pending':
      return translate('auto.components.cloud.sessions.outcome.pending', 'Not started')
    case 'running':
      return translate('auto.components.cloud.sessions.outcome.running', 'Working toward criteria')
    case 'evaluating':
      return translate('auto.components.cloud.sessions.outcome.evaluating', 'Grading')
    case 'needs_revision':
      return translate('auto.components.cloud.sessions.outcome.needsRevision', 'Needs revision')
    case 'satisfied':
      return translate('auto.components.cloud.sessions.outcome.satisfied', 'Criteria met')
    case 'max_iterations_reached':
      return translate(
        'auto.components.cloud.sessions.outcome.maxIterations',
        'Not met: iteration limit reached'
      )
    case 'failed':
      return translate('auto.components.cloud.sessions.outcome.failed', 'Cannot be satisfied')
    case 'interrupted':
      return translate('auto.components.cloud.sessions.outcome.interrupted', 'Interrupted')
  }
}

const TONE_CLASS: Record<Tone, string> = {
  pending: 'border-border bg-muted/30 text-muted-foreground',
  evaluating: 'border-border bg-muted/30 text-foreground',
  satisfied: 'border-status-success-border bg-status-success-background text-status-success',
  warning: 'border-agent-question/30 bg-agent-question/10 text-agent-question-text',
  error: 'border-destructive/30 bg-destructive/10 text-destructive'
}

function ToneIcon({ tone }: { tone: Tone }): React.JSX.Element {
  const className = 'mt-0.5 size-4 shrink-0'
  switch (tone) {
    case 'satisfied':
      return <CheckCircle2 className={className} />
    case 'error':
      return <XCircle className={className} />
    case 'evaluating':
      return <LoaderCircle className={cn(className, 'animate-spin')} />
    case 'warning':
      return <CircleDashed className={className} />
    case 'pending':
      return <Target className={className} />
  }
}

/**
 * The acceptance goal and how grading is going. Shown above the transcript so the
 * question a reviewer actually has — did it pass? — is answered before they read.
 */
export function CloudOutcomeBanner({ outcome }: { outcome: CloudOutcome }): React.JSX.Element {
  const tone = toneFor(outcome.result)
  const graded = outcome.iterations.length
  const progress =
    outcome.maxIterations !== null
      ? translate(
          'auto.components.cloud.sessions.outcome.progress',
          'iteration {{value0}} of {{value1}}',
          {
            value0: String(Math.min(graded + (outcome.terminal ? 0 : 1), outcome.maxIterations)),
            value1: String(outcome.maxIterations)
          }
        )
      : null
  return (
    <section
      aria-label={translate('auto.components.cloud.sessions.outcome.label', 'Acceptance criteria')}
      className={cn('border-b px-3 py-2 text-xs', TONE_CLASS[tone])}
    >
      <div className="flex items-start gap-2">
        <ToneIcon tone={tone} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{outcomeResultLabel(outcome.result)}</span>
            {progress ? <span className="opacity-80">{progress}</span> : null}
          </p>
          {/* Why: the criteria sentence is the thing being graded, so it wraps instead of
              ending in an ellipsis the reader cannot expand. */}
          <p className="break-words text-foreground/90">{outcome.description}</p>
          {outcome.explanation ? (
            <p className="whitespace-pre-wrap break-words opacity-90">{outcome.explanation}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
