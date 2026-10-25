import { useEffect, useId, useRef, useState } from 'react'
import { Check, LoaderCircle, Send, ShieldAlert, Square, X } from 'lucide-react'
import type {
  CloudAgentActionFailure,
  CloudAgentProviderCapabilities
} from '../../../../shared/cloud-agent-provider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { SessionActionState } from './use-cloud-session-action'
import { CloudSessionModelPicker } from './CloudSessionModelPicker'
import { cloudAgentFailureCopy, providerLabel } from './cloud-agent-failure-copy'
import { cloudSessionDrafts as draftsBySession } from './cloud-session-context'

type CloudSessionControlsProps = {
  capabilities: CloudAgentProviderCapabilities
  /** The session the composer writes to; drafts are kept per session. */
  sessionId: string
  /** What the event tail says the session is doing. */
  state: 'working' | 'blocked' | 'idle' | 'unknown' | 'ended'
  /** Tool calls still awaiting a human; the first one is what Approve/Deny targets. */
  pendingToolCallIds: readonly string[]
  /** Model the vendor says this session runs, for the picker's current value. */
  modelId: string | null
  /** Name + argument summary of the call the buttons would answer, when it is known. */
  pendingTool: string | null
  /** The session's vendor, so a model switch reaches the right adapter. */
  provider?: string | null
  actions: SessionActionState
}

function ActionFailure({
  failure,
  onDismiss,
  provider
}: {
  failure: CloudAgentActionFailure
  onDismiss: () => void
  provider: string | null
}): React.JSX.Element {
  const message = cloudAgentFailureCopy(failure, providerLabel(provider))
  return (
    <p
      role="alert"
      className="mx-auto flex w-full max-w-4xl items-start gap-2 px-3 py-1.5 text-xs text-destructive"
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {/* Why: the only way to clear a failure sat in a 12px icon — too small to hit. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={translate('auto.components.cloud.sessions.controls.dismiss', 'Dismiss')}
        className="-my-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </p>
  )
}

/**
 * One footer, not a stack of bands. The composer is always there when the provider can take
 * a message — disabled while the agent is busy or a tool call waits on a human, with the
 * approval decision stacked above it instead of in place of it.
 */
export function CloudSessionControls({
  capabilities,
  sessionId,
  state,
  pendingToolCallIds,
  pendingTool,
  modelId,
  provider,
  actions
}: CloudSessionControlsProps): React.JSX.Element | null {
  const draftKey = JSON.stringify([provider, sessionId])
  const [draft, setDraft] = useState(() => draftsBySession.get(draftKey) ?? '')

  useEffect(() => {
    setDraft(draftsBySession.get(draftKey) ?? '')
  }, [draftKey])

  const updateDraft = (next: string): void => {
    setDraft(next)
    if (next) {
      draftsBySession.set(draftKey, next)
    } else {
      draftsBySession.delete(draftKey)
    }
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const blocked =
    state === 'blocked' && capabilities.approveToolCall && pendingToolCallIds.length > 0
  const canCancel = capabilities.cancelTurn && state === 'working'
  const canSend = capabilities.sendMessage && state === 'idle'
  const showComposer = capabilities.sendMessage
  const pending = actions.pending !== null

  // Why: same idiom as the Linear comment footer — a 1-row box that scrolls hides the draft.
  const autoGrow = (element: HTMLTextAreaElement | null): void => {
    if (!element) {
      return
    }
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 96)}px`
  }

  // Why: clear only after the vendor accepts — the echo then arrives over the stream, so
  // clearing eagerly would lose the text on a rejected send.
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text) {
      return
    }
    if (await actions.run({ kind: 'send-message', text })) {
      updateDraft('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      textareaRef.current?.focus()
    }
  }

  if (!showComposer && !canCancel && !actions.failure) {
    return null
  }

  return (
    <div className="border-t border-worktree-sidebar-border" data-cloud-session-controls="">
      {actions.failure ? (
        <ActionFailure
          failure={actions.failure}
          onDismiss={actions.dismissFailure}
          provider={provider ?? null}
        />
      ) : null}
      {blocked ? (
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-agent-question-text">
              {translate(
                'auto.components.cloud.sessions.controls.approvePrompt',
                'Approve the pending tool call to let the agent continue.'
              )}
            </p>
            {/* Why: approving a command is the one irreversible click here, so the bar names the
                call and its place in the queue instead of making the reader hunt the transcript. */}
            {pendingTool || pendingToolCallIds.length > 1 ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {pendingTool ?? ''}
                {pendingToolCallIds.length > 1
                  ? `${pendingTool ? ' ' : ''}(1/${pendingToolCallIds.length})`
                  : ''}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              void actions.run({
                kind: 'confirm-tool',
                toolUseId: pendingToolCallIds[0],
                decision: 'deny'
              })
            }
          >
            {translate('auto.components.cloud.sessions.controls.deny', 'Deny')}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              void actions.run({
                kind: 'confirm-tool',
                toolUseId: pendingToolCallIds[0],
                decision: 'allow'
              })
            }
          >
            {actions.pending === 'confirm-tool' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {translate('auto.components.cloud.sessions.controls.approve', 'Approve')}
          </Button>
        </div>
      ) : null}
      {showComposer || canCancel ? (
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2 px-3 py-2">
          {showComposer ? (
            <Textarea
              ref={(element) => {
                textareaRef.current = element
                autoGrow(element)
              }}
              id={inputId}
              rows={1}
              value={draft}
              onChange={(event) => {
                updateDraft(event.target.value)
                autoGrow(event.target)
              }}
              onKeyDown={(event) => {
                // Why: every other chat composer in Orca sends on Enter and breaks the line on
                // Shift+Enter; the form shortcut here made a follow-up need ⌘⏎ instead.
                if (
                  !canSend ||
                  event.nativeEvent.isComposing ||
                  event.key !== 'Enter' ||
                  event.shiftKey
                ) {
                  return
                }
                event.preventDefault()
                void send()
              }}
              disabled={!canSend || pending}
              placeholder={
                canSend
                  ? translate(
                      'auto.components.cloud.sessions.controls.placeholder',
                      'Send a follow-up to this cloud session'
                    )
                  : blocked
                    ? translate(
                        'auto.components.cloud.sessions.controls.blockedPlaceholder',
                        'Approve the tool call above to keep this session going'
                      )
                    : state === 'working'
                      ? translate(
                          'auto.components.cloud.sessions.controls.busyPlaceholder',
                          'The agent is working; wait or cancel the turn'
                        )
                      : state === 'ended'
                        ? // Why: a terminated session still read as idle, so the composer invited a
                          // follow-up the vendor would reject.
                          translate(
                            'auto.components.cloud.sessions.controls.endedPlaceholder',
                            'This session has ended and cannot take new messages'
                          )
                        : translate(
                            'auto.components.cloud.sessions.controls.unverifiedPlaceholder',
                            'The session state is unverified; it cannot take a message yet'
                          )
              }
              aria-label={translate(
                'auto.components.cloud.sessions.controls.messageLabel',
                'Message to the cloud session'
              )}
              className="min-h-9 flex-1 resize-none"
            />
          ) : null}
          {showComposer ? (
            // Why here: a model pick reads as part of sending the next turn, so it belongs in the
            // composer row (the way Codex and the vendor console place it), not in a header menu.
            capabilities.modelSelection ? (
              <CloudSessionModelPicker
                sessionId={sessionId}
                modelId={modelId}
                disabled={state === 'working' || state === 'ended' || pending}
                provider={provider}
              />
            ) : null
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void actions.run({ kind: 'cancel-turn' })}
              aria-label={translate(
                'auto.components.cloud.sessions.controls.cancel',
                'Cancel turn'
              )}
            >
              {actions.pending === 'cancel-turn' ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
            </Button>
          ) : showComposer ? (
            <Button
              size="sm"
              disabled={!canSend || pending || !draft.trim()}
              onClick={() => void send()}
              aria-label={translate('auto.components.cloud.sessions.controls.send', 'Send message')}
            >
              {actions.pending === 'send-message' ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
