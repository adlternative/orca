import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import {
  isQoderCloudOutcomeResult,
  type QoderCloudOutcomeResult
} from '../../../../shared/qoder-cloud-events'
import { outcomeResultLabel } from '@/components/cloud-sessions/CloudOutcomeBanner'
import { CloudArtifactNotice } from '@/components/cloud-sessions/CloudArtifactNotice'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { ProviderFrameRow } from './NativeChatTranscriptChrome'

export function NativeChatNoticeRow({
  block,
  onLinkClick,
  allowFileUriLinks = false
}: {
  block: NativeChatTextBlock
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}): React.JSX.Element {
  if (block.presentation === 'compaction') {
    const label = translate('components.native-chat.notices.compaction', 'Context compacted')
    return (
      <div
        role="separator"
        aria-label={label}
        className="flex items-center gap-3 py-2 text-xs text-muted-foreground"
      >
        <span className="h-px flex-1 bg-border" />
        <span>{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    )
  }
  if (block.presentation === 'cloud-artifact') {
    return <CloudArtifactNotice block={block} />
  }
  if (block.presentation === 'cloud-session-error') {
    const exhausted = block.caption === 'exhausted'
    return (
      <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        <p className="flex items-center gap-2 font-medium">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {translate('components.native-chat.notices.cloudSessionError', 'Session error')}
          {exhausted ? (
            <span className="text-xs font-normal opacity-80">
              {translate(
                'components.native-chat.notices.cloudSessionErrorExhausted',
                'will not retry on its own'
              )}
            </span>
          ) : null}
        </p>
        <p className="whitespace-pre-wrap break-words text-foreground/90">{block.text}</p>
      </div>
    )
  }
  if (block.presentation === 'cloud-session-updated') {
    const tools = block.caption
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="size-3.5 shrink-0" />
        {translate(
          'components.native-chat.notices.cloudSessionUpdated',
          'Agent configuration updated'
        )}
        {block.text ? <span>· {block.text}</span> : null}
        {tools ? (
          <span>
            ·{' '}
            {translate(
              'components.native-chat.notices.cloudSessionUpdatedTools',
              '{{value0}} tools',
              {
                value0: tools
              }
            )}
          </span>
        ) : null}
      </p>
    )
  }
  if (block.presentation === 'cloud-outcome-defined') {
    const limit = block.caption
    return (
      <Card className="gap-3 py-3 shadow-xs">
        <CardHeader className="px-4">
          <CardTitle>
            {translate('components.native-chat.notices.acceptanceCriteria', 'Acceptance criteria')}
          </CardTitle>
          {limit ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'components.native-chat.notices.acceptanceCriteriaLimit',
                'up to {{value0}} iterations',
                { value0: limit }
              )}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 text-sm leading-relaxed text-foreground">
          <CommentMarkdown
            content={block.text}
            variant="document"
            className="text-sm"
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
          />
        </CardContent>
      </Card>
    )
  }
  if (block.presentation === 'cloud-outcome-verdict') {
    const [rawResult, rawIteration] = (block.caption ?? '').split(':')
    const result: QoderCloudOutcomeResult = isQoderCloudOutcomeResult(rawResult)
      ? rawResult
      : 'failed'
    const iteration = Number(rawIteration)
    const satisfied = result === 'satisfied'
    const Icon = satisfied ? CheckCircle2 : block.tone === 'error' ? AlertCircle : AlertTriangle
    return (
      <div
        className={cn(
          'space-y-1 rounded-md border p-3 text-sm',
          satisfied
            ? 'border-status-success-border bg-status-success-background text-status-success'
            : block.tone === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-agent-question/30 bg-agent-question/10 text-agent-question-text'
        )}
      >
        <p className="flex items-center gap-2 font-medium">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {outcomeResultLabel(result)}
          {Number.isFinite(iteration) ? (
            <span className="text-xs font-normal opacity-80">
              {translate(
                'components.native-chat.notices.outcomeIteration',
                'iteration {{value0}}',
                {
                  value0: String(iteration + 1)
                }
              )}
            </span>
          ) : null}
        </p>
        {block.text ? (
          <p className="whitespace-pre-wrap break-words text-foreground/90">{block.text}</p>
        ) : null}
      </div>
    )
  }
  if (block.presentation === 'plan-document') {
    return (
      <Card className="gap-3 py-3 shadow-xs">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">
            {translate('components.native-chat.notices.plan', 'Plan')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 text-sm leading-relaxed text-foreground">
          <CommentMarkdown
            content={block.text}
            variant="document"
            className="text-sm"
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
            linkifyFilePaths={onLinkClick !== undefined}
          />
        </CardContent>
      </Card>
    )
  }
  const tone = block.tone
  const Icon =
    tone === 'warning'
      ? AlertTriangle
      : tone === 'error'
        ? AlertCircle
        : tone === 'notice'
          ? Info
          : null
  return (
    <div
      className={cn(
        'space-y-2 text-sm text-foreground',
        Icon && 'rounded-md border border-border bg-muted/20 p-3',
        tone === 'warning' && 'text-[color:var(--warning,#f59e0b)]',
        tone === 'error' && 'text-destructive',
        tone === 'notice' && 'text-muted-foreground'
      )}
    >
      <div className="flex items-start gap-2">
        {Icon ? <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
        <p className="min-w-0 whitespace-pre-wrap break-words">{block.text}</p>
      </div>
      {block.providerFrame ? (
        <ProviderFrameRow
          block={block}
          summary={translate('components.native-chat.notices.details', 'Details')}
        />
      ) : null}
    </div>
  )
}
