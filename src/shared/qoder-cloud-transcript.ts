import type { NativeChatBlock, NativeChatMessage } from './native-chat-types'
import type { QoderCloudContentBlock, QoderCloudEvent } from './qoder-cloud-events'
import { cloudNoticeBlock } from './qoder-cloud-notices'

export { CLOUD_NOTICE_PRESENTATION, CLOUD_OUTCOME_PRESENTATION } from './qoder-cloud-notices'

import { parseWebSearchResults } from './qoder-cloud-transcript-facts'

export {
  deliveredArtifacts,
  parseWebSearchResults,
  unresolvedToolCallIds,
  type CloudDeliveredArtifact
} from './qoder-cloud-transcript-facts'

/** Agent id shown on cloud transcripts; not a TuiAgent because nothing launches it locally. */
export const QODER_CLOUD_AGENT_TYPE = 'qoder-cloud'

function textOf(blocks: readonly QoderCloudContentBlock[]): string {
  return blocks
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('')
}

function epochMs(iso: string): number | null {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : null
}

function message(
  event: QoderCloudEvent,
  role: NativeChatMessage['role'],
  blocks: NativeChatBlock[],
  turnId: string | undefined
): NativeChatMessage {
  return {
    id: event.id,
    role,
    blocks,
    timestamp: epochMs(event.processed_at),
    source: 'transcript',
    ...(turnId ? { turnId } : {})
  }
}

/**
 * Decode an ascending Qoder event log into native-chat messages. Turn boundaries
 * come from `user.message`; a tool_use that stopped the session with
 * `requires_action` is rendered as a running (unresolved) call so the view shows
 * what the agent is waiting on. Status/span bookkeeping events produce nothing.
 */
export function decodeQoderCloudTranscript(
  eventsAscending: readonly QoderCloudEvent[]
): NativeChatMessage[] {
  const out: NativeChatMessage[] = []
  let turnId: string | undefined
  const pendingToolIndex = new Map<string, number>()
  const toolNameById = new Map<string, string>()
  // Why: the vendor's client-tool result carries no tool_use_id (observed), so it resolves
  // the most recent client call still open — the only correlation the data supports.
  const openClientCalls: string[] = []

  for (const event of eventsAscending) {
    switch (event.type) {
      case 'user.message': {
        turnId = event.id
        const text = textOf(event.content)
        out.push(message(event, 'user', text ? [{ type: 'text', text }] : [], turnId))
        break
      }
      case 'user.define_outcome': {
        turnId = event.id
        out.push(
          message(
            event,
            'user',
            event.description ? [{ type: 'text', text: event.description }] : [],
            turnId
          )
        )
        const rubric = cloudNoticeBlock(event)
        if (rubric) {
          // Why: two messages from one event need distinct ids for the list key.
          out.push({ ...message(event, 'system', [rubric], turnId), id: `${event.id}:rubric` })
        }
        break
      }
      case 'span.outcome_evaluation_end':
      case 'agent.artifact_delivered':
      case 'session.error':
      case 'agent.thread_context_compacted':
      case 'session.updated': {
        const notice = cloudNoticeBlock(event)
        if (notice) {
          out.push(message(event, 'system', [notice], turnId))
        }
        break
      }
      case 'agent.message': {
        const text = textOf(event.content)
        if (text.trim()) {
          out.push(message(event, 'assistant', [{ type: 'text', text }], turnId))
        }
        break
      }
      case 'agent.thinking':
        // Why: the vendor emits a marker with no content; a visible empty reasoning row would mislead.
        break
      case 'agent.tool_use': {
        pendingToolIndex.set(event.id, out.length)
        toolNameById.set(event.id, event.name)
        out.push(
          message(
            event,
            'assistant',
            [
              {
                type: 'tool-call',
                name: event.name,
                input: event.input,
                callId: event.id,
                state: 'running'
              }
            ],
            turnId
          )
        )
        break
      }
      case 'agent.tool_result': {
        const resultText = textOf(event.content)
        const callIndex = pendingToolIndex.get(event.tool_use_id)
        if (callIndex !== undefined) {
          const call = out[callIndex]
          const block = call.blocks[0]
          if (block.type === 'tool-call') {
            block.state = event.is_error ? 'failed' : 'completed'
            if (toolNameById.get(event.tool_use_id) === 'WebSearch' && !event.is_error) {
              const results = parseWebSearchResults(resultText)
              if (results.length > 0) {
                block.webSearchResults = results
              }
            }
          }
          pendingToolIndex.delete(event.tool_use_id)
        }
        out.push(
          message(
            event,
            'tool',
            [{ type: 'tool-result', output: resultText, isError: event.is_error }],
            turnId
          )
        )
        break
      }
      case 'agent.custom_tool_use': {
        pendingToolIndex.set(event.id, out.length)
        toolNameById.set(event.id, event.name)
        openClientCalls.push(event.id)
        out.push(
          message(
            event,
            'assistant',
            [
              {
                type: 'tool-call',
                name: event.name,
                // Why: the client ran this, not the sandbox. The existing `server / tool` rendering
                // for MCP identities says exactly that without a new badge.
                mcpIdentity: { server: 'client', tool: event.title ?? event.name },
                input: event.input,
                callId: event.id,
                state: 'running'
              }
            ],
            turnId
          )
        )
        break
      }
      case 'user.custom_tool_result': {
        const callId = event.tool_use_id || openClientCalls.pop() || ''
        const callIndex = pendingToolIndex.get(callId)
        if (callIndex !== undefined) {
          const block = out[callIndex].blocks[0]
          if (block.type === 'tool-call') {
            block.state = 'completed'
          }
          pendingToolIndex.delete(callId)
        }
        out.push(
          message(event, 'tool', [{ type: 'tool-result', output: textOf(event.content) }], turnId)
        )
        break
      }
      case 'session.status_running':
      case 'session.status_idle':
      case 'session.thread_status_running':
      case 'session.thread_status_idle':
      case 'span.model_request_start':
      case 'span.model_request_end':
      case 'span.outcome_evaluation_start':
      case 'span.outcome_evaluation_ongoing':
      case 'session.usage':
      case 'session.status_rescheduled':
      case 'session.thread_status_rescheduled':
      case 'other':
        // Lifecycle and accounting events carry nothing a reader needs to see.
        break
    }
  }
  return out
}
