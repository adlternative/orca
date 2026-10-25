import { useEffect, useRef } from 'react'
import { cloudSessionKey } from './cloud-session-context'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  rememberCloudSessionTitle,
  requestCloudSessionsRefresh
} from '../sidebar/use-cloud-sessions-feed'

function firstUserText(messages: readonly NativeChatMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') {
      continue
    }
    const text = message.blocks
      .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
      .join('')
      .trim()
    if (text) {
      return text
    }
  }
  return ''
}

/**
 * Names a vendor-untitled session after its first prompt.
 *
 * Why: the vendor leaves drafts unnamed, so the sidebar read "Untitled session · gtf0" six times
 * over. The transcript already carries the human-written prompt; remembering it makes those rows
 * scannable without another provider call.
 */
export function useCloudSessionPromptTitle(
  sessionId: string,
  vendorTitle: string | null,
  messages: readonly NativeChatMessage[],
  provider: string | null
): void {
  const claimed = useRef(new Set<string>())

  useEffect(() => {
    const key = cloudSessionKey(provider ?? 'qoder-cloud', sessionId)
    if (!provider || vendorTitle || claimed.current.has(key)) {
      return
    }
    const text = firstUserText(messages)
    if (!text) {
      return
    }
    claimed.current.add(key)
    rememberCloudSessionTitle(sessionId, text, provider)
    // Rows read the provisional title from module state, so nudge the feed to re-render them.
    requestCloudSessionsRefresh()
  }, [messages, sessionId, vendorTitle, provider])
}
