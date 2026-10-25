import {
  isQoderCloudOutcomeResult,
  type QoderCloudContentBlock,
  type QoderCloudEvent,
  type QoderCloudEventPage,
  type QoderCloudRubric,
  type QoderCloudStopReason
} from './qoder-cloud-events'

// Narrowing of raw vendor JSON into `QoderCloudEvent`. Kept apart from the type module so
// each stays within the file budget and the types can be imported without the parser.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function contentBlocks(value: unknown): QoderCloudContentBlock[] {
  if (!Array.isArray(value)) {
    return []
  }
  const blocks: QoderCloudContentBlock[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.type !== 'string') {
      continue
    }
    blocks.push(
      item.type === 'text' && typeof item.text === 'string'
        ? { type: 'text', text: item.text }
        : { type: item.type }
    )
  }
  return blocks
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rubric(value: unknown): QoderCloudRubric | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.type === 'text' && typeof value.content === 'string') {
    return { type: 'text', content: value.content }
  }
  if (value.type === 'file' && typeof value.file_id === 'string') {
    return { type: 'file', fileId: value.file_id }
  }
  return null
}

function stopReason(value: unknown): QoderCloudStopReason | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }
  const ids = Array.isArray(value.event_ids)
    ? value.event_ids.filter((id): id is string => typeof id === 'string')
    : undefined
  return ids ? { type: value.type, event_ids: ids } : { type: value.type }
}

export function parseQoderCloudEvent(value: unknown): QoderCloudEvent | null {
  if (!isRecord(value)) {
    return null
  }
  const id = str(value.id)
  const processedAt = str(value.processed_at)
  const type = str(value.type)
  if (!id || !processedAt || !type) {
    return null
  }
  const base = { id, processed_at: processedAt }
  switch (type) {
    case 'user.message':
    case 'agent.message':
      return { ...base, type, content: contentBlocks(value.content) }
    case 'agent.thinking':
    case 'session.status_running':
    case 'span.model_request_start':
      return { ...base, type }
    case 'agent.tool_use':
      return {
        ...base,
        type,
        name: str(value.name) ?? 'tool',
        input: value.input,
        evaluated_permission: str(value.evaluated_permission)
      }
    case 'agent.tool_result':
      return {
        ...base,
        type,
        tool_use_id: str(value.tool_use_id) ?? '',
        content: contentBlocks(value.content),
        is_error: value.is_error === true
      }
    case 'session.status_idle':
      return { ...base, type, stop_reason: stopReason(value.stop_reason) }
    case 'session.thread_status_running':
      return { ...base, type, agent_name: str(value.agent_name) }
    case 'session.thread_status_idle':
      return {
        ...base,
        type,
        agent_name: str(value.agent_name),
        stop_reason: stopReason(value.stop_reason)
      }
    case 'span.model_request_end': {
      const usage = isRecord(value.model_usage) ? value.model_usage : null
      const credits = usage && typeof usage.credits === 'number' ? usage.credits : null
      return { ...base, type, is_error: value.is_error === true, credits }
    }
    case 'user.define_outcome': {
      const outcomeId = str(value.outcome_id)
      if (!outcomeId) {
        return { ...base, type: 'other', rawType: type }
      }
      return {
        ...base,
        type,
        outcome_id: outcomeId,
        description: str(value.description) ?? '',
        rubric: rubric(value.rubric),
        max_iterations: num(value.max_iterations)
      }
    }
    case 'span.outcome_evaluation_start':
    case 'span.outcome_evaluation_ongoing': {
      const outcomeId = str(value.outcome_id)
      if (!outcomeId) {
        return { ...base, type: 'other', rawType: type }
      }
      return { ...base, type, outcome_id: outcomeId, iteration: num(value.iteration) ?? 0 }
    }
    case 'span.outcome_evaluation_end': {
      const outcomeId = str(value.outcome_id)
      if (!outcomeId || !isQoderCloudOutcomeResult(value.result)) {
        return { ...base, type: 'other', rawType: type }
      }
      const usage = isRecord(value.usage) ? value.usage : null
      return {
        ...base,
        type,
        outcome_id: outcomeId,
        iteration: num(value.iteration) ?? 0,
        result: value.result,
        explanation: str(value.explanation),
        credits: usage ? num(usage.credits) : null
      }
    }
    case 'agent.artifact_delivered': {
      const fileId = str(value.file_id)
      if (!fileId) {
        return { ...base, type: 'other', rawType: type }
      }
      return {
        ...base,
        type,
        file_id: fileId,
        original_filename: str(value.original_filename),
        content_type: str(value.content_type),
        size: num(value.size)
      }
    }
    case 'session.usage':
      return { ...base, type, total_credits: num(value.total_credits) }
    case 'session.error': {
      const error = isRecord(value.error) ? value.error : null
      const retry = error && isRecord(error.retry_status) ? str(error.retry_status.type) : null
      return {
        ...base,
        type,
        error_type: (error && str(error.type)) ?? 'error',
        message: (error && str(error.message)) ?? '',
        server: error ? str(error.mcp_server_name) : null,
        retry
      }
    }
    case 'agent.thread_context_compacted': {
      const usage = isRecord(value.usage) ? value.usage : null
      return { ...base, type, credits: usage ? num(usage.credits) : null }
    }
    case 'session.updated': {
      const agent = isRecord(value.agent) ? value.agent : null
      const model = agent && isRecord(agent.model) ? str(agent.model.id) : null
      let toolCount: number | null = null
      if (agent && Array.isArray(agent.tools)) {
        toolCount = 0
        for (const toolset of agent.tools) {
          if (isRecord(toolset) && Array.isArray(toolset.enabled_tools)) {
            toolCount += toolset.enabled_tools.length
          }
        }
      }
      return {
        ...base,
        type,
        agent_name: agent ? str(agent.name) : null,
        model,
        tool_count: toolCount
      }
    }
    case 'agent.custom_tool_use': {
      const input = isRecord(value.input) ? value.input : null
      return {
        ...base,
        type,
        name: str(value.name) ?? 'tool',
        input: value.input,
        title: input ? str(input.tool_title) : null
      }
    }
    case 'user.custom_tool_result':
      return {
        ...base,
        type,
        tool_use_id: str(value.tool_use_id) ?? '',
        content: contentBlocks(value.content)
      }
    case 'session.status_rescheduled':
    case 'session.thread_status_rescheduled':
      return { ...base, type }
    default:
      return { ...base, type: 'other', rawType: type }
  }
}

export function parseQoderCloudEventPage(value: unknown): QoderCloudEventPage | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null
  }
  const events: QoderCloudEvent[] = []
  for (const item of value.data) {
    const event = parseQoderCloudEvent(item)
    if (event) {
      events.push(event)
    }
  }
  return { events, nextPage: str(value.next_page) }
}
