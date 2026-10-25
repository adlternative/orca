import type { NativeChatWebSearchResult } from './native-chat-tool-identity'
import type { QoderCloudEvent } from './qoder-cloud-events'

// Facts derived from a cloud session's event log that are not transcript messages:
// search hits to attach to a tool row, unresolved calls, delivered files.

function epochMs(iso: string): number | null {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : null
}

/**
 * Qoder's WebSearch returns its hits as a JSON array inside the result text. Pull them out
 * so the tool row renders the same clickable list Claude and Codex searches get; the raw
 * text stays in the tool-result block for the disclosure.
 */
export function parseWebSearchResults(resultText: string): NativeChatWebSearchResult[] {
  const start = resultText.indexOf('[')
  const end = resultText.lastIndexOf(']')
  if (start === -1 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(resultText.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const results: NativeChatWebSearchResult[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue
    }
    const record: Record<string, unknown> = item
    if (typeof record.url === 'string' && typeof record.title === 'string') {
      results.push({ title: record.title, url: record.url })
    }
  }
  return results
}

/** Tool calls still unresolved at the end of the log: what a blocked session is waiting on. */
export function unresolvedToolCallIds(eventsAscending: readonly QoderCloudEvent[]): string[] {
  const pending = new Set<string>()
  const openClient: string[] = []
  for (const event of eventsAscending) {
    if (event.type === 'agent.tool_use') {
      pending.add(event.id)
    } else if (event.type === 'agent.custom_tool_use') {
      pending.add(event.id)
      openClient.push(event.id)
    } else if (event.type === 'agent.tool_result') {
      pending.delete(event.tool_use_id)
    } else if (event.type === 'user.custom_tool_result') {
      pending.delete(event.tool_use_id || openClient.pop() || '')
    }
  }
  return [...pending]
}

export type CloudDeliveredArtifact = {
  fileId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  deliveredAt: number | null
}

/** Every file the agent delivered, in order; the drawer shows these before the transcript. */
export function deliveredArtifacts(
  eventsAscending: readonly QoderCloudEvent[]
): CloudDeliveredArtifact[] {
  const out: CloudDeliveredArtifact[] = []
  for (const event of eventsAscending) {
    if (event.type === 'agent.artifact_delivered') {
      out.push({
        fileId: event.file_id,
        filename: event.original_filename ?? event.file_id,
        mimeType: event.content_type,
        sizeBytes: event.size,
        deliveredAt: epochMs(event.processed_at)
      })
    }
  }
  return out
}
