import { useEffect, useMemo, useState } from 'react'
import { Cloud, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { cloudSessionTitle } from '@/components/sidebar/use-cloud-sessions-feed'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { NativeChatMessageList } from '@/components/native-chat/NativeChatMessageList'
import type { NativeChatLiveSession } from '@/components/native-chat/use-native-chat-live-session'
import { useNativeChatFontScale } from '@/components/native-chat/use-native-chat-font-scale'
import {
  getCloudAgentProvider,
  listCloudAgentProviders
} from '../../../../shared/cloud-agent-provider-registry'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'
import { QODER_CLOUD_AGENT_TYPE } from '../../../../shared/qoder-cloud-transcript'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { CloudArtifactsStrip } from './CloudArtifactsStrip'
import { CloudSessionDrawerHeader } from './CloudSessionDrawerHeader'
import { cloudAgentFailureCopy, providerLabel } from './cloud-agent-failure-copy'
import { cloudSessionStatusWord } from './cloud-session-status-word'
import { useCloudSessionPromptTitle } from './use-cloud-session-prompt-title'
import { usePendingToolLabel } from './use-pending-tool-label'
import { CloudOutcomeBanner } from './CloudOutcomeBanner'
import { CloudSessionControls } from './CloudSessionControls'
import { useCloudSessionAction } from './use-cloud-session-action'
import { useCloudSessionTranscript } from './use-cloud-session-transcript'

export function CloudSessionDrawerBody({
  sessionId,
  row,
  provider,
  onClose
}: {
  sessionId: string
  row: CloudAgentSessionRow | null
  /** The session's vendor, so every call inside the body reaches the right adapter. */
  provider: string | null
  onClose: () => void
}): React.JSX.Element {
  const transcript = useCloudSessionTranscript(sessionId, provider)
  const actions = useCloudSessionAction(sessionId, provider)
  const pendingTool = usePendingToolLabel(
    transcript.messages,
    transcript.pendingToolCallIds[0] ?? null
  )
  useCloudSessionPromptTitle(sessionId, row?.title ?? null, transcript.messages, provider)
  // Why: the composer clears on success, so a slow stream (or a closed one) left the just-sent
  // message invisible for up to a poll interval — read the tail back at once instead.
  const { refreshTail } = transcript
  const sentAt = actions.lastSentAt
  useEffect(() => {
    if (sentAt !== null) {
      void refreshTail()
    }
  }, [refreshTail, sentAt])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const fontScale = useNativeChatFontScale(true)
  // Why: same handle the sidebar row shows for a nameless draft, so the two agree.
  const title =
    row?.title ??
    cloudSessionTitle(sessionId, provider ?? row?.provider ?? 'qoder-cloud') ??
    `${translate('auto.components.cloud.sessions.drawer.untitled', 'Untitled session')} · ${sessionId.slice(-4)}`
  // Why the row as the fallback: a provider whose transcript carries no lifecycle events (OpenHands
  // reports state on the session object) would otherwise render as "unverified" while the list row
  // next to it says working/blocked. The row is the vendor's own answer, so it wins when the
  // transcript has nothing to say.
  const rowState = row?.state === 'unverifiable' ? 'unknown' : (row?.state ?? 'unknown')
  const state = transcript.state === 'unknown' ? rowState : transcript.state
  const working = state === 'working'
  const blocked = state === 'blocked'
  const unsupported = transcript.failure?.reason === 'unsupported'

  // Why: a session created a moment ago has no feed row yet, and losing its capabilities would
  // silently drop the write controls and the console link for a whole poll interval.
  const descriptor =
    getCloudAgentProvider(provider ?? row?.provider ?? '') ??
    (listCloudAgentProviders().length === 1 ? listCloudAgentProviders()[0] : null)
  const capabilities = descriptor?.capabilities ?? null

  const session = useMemo<NativeChatLiveSession>(
    () => ({
      messages: transcript.messages,
      status:
        transcript.phase === 'error'
          ? 'error'
          : transcript.phase === 'loading'
            ? 'loading'
            : working
              ? 'working'
              : transcript.messages.length === 0
                ? 'empty'
                : 'ready',
      sessionId,
      agent: QODER_CLOUD_AGENT_TYPE,
      ...(transcript.failure ? { error: transcript.failure.message } : {}),
      hasMore: transcript.hasMore,
      loadingEarlier: transcript.loadingEarlier,
      loadEarlier: transcript.loadEarlier,
      readPhase: transcript.phase === 'error' ? 'error' : transcript.phase
    }),
    [transcript, sessionId, working]
  )

  const latestOutcome = transcript.activeOutcome ?? transcript.outcomes.at(-1) ?? null

  const ended = row?.state === 'ended'
  const statusWord = cloudSessionStatusWord({
    blocked,
    ended,
    hasOutcome: transcript.activeOutcome !== null,
    outcomeResult: transcript.activeOutcome?.result ?? null,
    working,
    state
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CloudSessionDrawerHeader
        title={title}
        sessionId={sessionId}
        streamState={ended ? 'closed' : transcript.streamState}
        statusWord={statusWord}
        working={working}
        blocked={blocked}
        state={state}
        consoleUrl={descriptor ? (row?.url ?? descriptor.consoleUrl) : null}
        canArchive={ended ? false : capabilities?.archiveSession === true}
        archivePending={actions.pending !== null}
        onArchive={() => setArchiveOpen(true)}
        onClose={onClose}
      />

      {latestOutcome ? <CloudOutcomeBanner outcome={latestOutcome} /> : null}
      <CloudArtifactsStrip artifacts={transcript.artifacts} />

      {/* Why: the transcript list sizes itself with flex-1, so its wrapper has to be the flex
          column it expects — as a plain block it grew to content height and the last messages
          were laid out below the sheet, out of reach of the scrollbar. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {transcript.phase === 'loading' ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : transcript.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div
              className={cn(
                'flex size-10 items-center justify-center rounded-full',
                unsupported
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              {unsupported ? <Cloud className="size-5" /> : <TriangleAlert className="size-5" />}
            </div>
            <p
              className={cn(
                'max-w-md text-balance text-xs',
                unsupported ? 'text-muted-foreground' : 'text-destructive'
              )}
            >
              {unsupported
                ? translate(
                    'auto.components.cloud.sessions.drawer.unsupported',
                    'This host cannot read cloud session transcripts yet. Update Orca on the host it is paired with, or open the session in the provider console.'
                  )
                : transcript.failure
                  ? cloudAgentFailureCopy(transcript.failure, providerLabel(provider))
                  : null}
            </p>
            {unsupported ? null : transcript.failure?.reason === 'not-found' ? (
              // Why no retry: a 404 means the session is gone from the vendor, so repeating the
              // identical read can only fail again — offer the way out instead.
              <Button variant="outline" size="sm" onClick={onClose}>
                {translate('auto.components.cloud.sessions.drawer.close', 'Close')}
              </Button>
            ) : (
              // Why: the reader gives up on a failed page and only a new read clears it —
              // without this the drawer is a dead end until it is closed and reopened.
              <Button variant="outline" size="sm" onClick={transcript.retry}>
                <RotateCw className="size-3.5" />
                {translate('auto.components.cloud.sessions.drawer.retry', 'Try again')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {transcript.failure ? (
              // Why inline: the history below is still readable, so a refresh failure must not
              // take the whole view hostage — it gets a strip with the reason and a retry.
              <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 pb-1 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 truncate">
                  {cloudAgentFailureCopy(transcript.failure, providerLabel(provider))}
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={transcript.retry}>
                  {translate('auto.components.cloud.sessions.drawer.retry', 'Try again')}
                </Button>
              </div>
            ) : null}
            <NativeChatMessageList
              session={session}
              contentInset="compact"
              isWorking={working}
              expandSignal={false}
              fontScale={fontScale.scale}
              showTurnStatus={false}
              showLiveTurnActivity={false}
            />
          </>
        )}
      </div>

      {capabilities && !unsupported ? (
        <CloudSessionControls
          capabilities={capabilities}
          sessionId={sessionId}
          // Why: a terminated session still reports an idle tail, which enabled the composer.
          state={ended ? 'ended' : state}
          pendingToolCallIds={transcript.pendingToolCallIds}
          pendingTool={pendingTool}
          modelId={row?.model ?? null}
          provider={provider}
          actions={actions}
        />
      ) : null}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.cloud.sessions.drawer.archiveTitle',
                'Archive this session?'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.cloud.sessions.drawer.archiveBody',
                'The provider stops accepting new work on it. Its history stays readable in the Qoder console.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
              {translate('auto.components.cloud.sessions.drawer.archiveCancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={actions.pending !== null}
              onClick={() => {
                void actions.run({ kind: 'archive' }).then((ok) => {
                  setArchiveOpen(false)
                  if (ok) {
                    onClose()
                  }
                })
              }}
            >
              {actions.pending === 'archive' ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {translate('auto.components.cloud.sessions.drawer.archiveConfirm', 'Archive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
