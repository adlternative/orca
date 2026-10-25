import { useMemo } from 'react'
import { isToolCallBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'
import { describeToolInput } from '../../../../shared/native-chat-tool-summary'

/**
 * Names the tool call the approval bar would answer, e.g. `Bash kubectl apply -f prod.yaml`.
 *
 * Why: the bar is the one place a click is irreversible, and it used to say only "the pending tool
 * call" — the reader had to find the row in the transcript to know what they were approving.
 */
export function usePendingToolLabel(
  messages: readonly NativeChatMessage[],
  pendingToolCallId: string | null
): string | null {
  return useMemo(() => {
    if (pendingToolCallId === null) {
      return null
    }
    for (const message of messages) {
      for (const block of message.blocks) {
        if (isToolCallBlock(block) && block.callId === pendingToolCallId) {
          // Same wording the transcript row uses, so the bar and the row agree.
          const summary = describeToolInput(block.input).trim()
          return summary ? `${block.name} ${summary}` : block.name
        }
      }
    }
    return null
  }, [messages, pendingToolCallId])
}
