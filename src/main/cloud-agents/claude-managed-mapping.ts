import {
  CLAUDE_MANAGED_DEFAULT_API_BASE_URL,
  CLAUDE_MANAGED_PROVIDER_ID
} from '../../shared/claude-managed'
import type {
  CloudAgentSessionRow,
  CloudAgentSessionState
} from '../../shared/cloud-agent-provider'
import type { CloudAgentContentBlock, CloudAgentEvent } from '../../shared/cloud-agent-events'

/**
 * Managed Agents wire format ⇄ the canonical cloud-agent model.
 *
 * Why separate from the adapter: the adapter owns requests, this owns vocabulary. The event names
 * here are the vendor's (`agent.tool_use`, `span.model_request_end`, `session.status_idle`), and the
 * mapping is what keeps those names out of the renderer.
 */
const PROVIDER = CLAUDE_MANAGED_PROVIDER_ID

export function claudeBaseUrl(): string {
  const value = process.env.ORCA_CLAUDE_MANAGED_BASE_URL
  const base = value && value.trim().length > 0 ? value.trim() : CLAUDE_MANAGED_DEFAULT_API_BASE_URL
  return base.replace(/\/+$/, '')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Managed Agents pages with `{data: [...], next_page}`, not `items`. */
export function itemsOf(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body)) {
    return []
  }
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body.items) ? body.items : []
  return list.filter(isRecord)
}

export function nextPageOf(body: unknown): string | null {
  if (!isRecord(body)) {
    return null
  }
  return typeof body.next_page === 'string' && body.next_page.length > 0 ? body.next_page : null
}

function blockText(block: unknown): string {
  if (typeof block === 'string') {
    return block
  }
  if (!isRecord(block)) {
    return ''
  }
  if (typeof block.text === 'string') {
    return block.text
  }
  return ''
}

/** Content arrays mix text blocks and richer payloads (search results); only text is rendered. */
export function contentOf(value: unknown): CloudAgentContentBlock[] {
  if (!Array.isArray(value)) {
    return typeof value === 'string' && value.length > 0 ? [{ type: 'text', text: value }] : []
  }
  return value.map((block) => ({ type: 'text', text: blockText(block) }) as CloudAgentContentBlock)
}

/**
 * Statuses the API documents for a session. Anything unknown stays `working`-neutral (`idle`) rather
 * than claiming a human is needed — a wrong `blocked` disables the composer.
 */
export function stateOf(raw: Record<string, unknown>): {
  state: CloudAgentSessionState
  vendorStatus: string
} {
  const status = typeof raw.status === 'string' ? raw.status : 'unknown'
  if (status === 'ready' || status === 'idle' || status === 'completed') {
    return { state: 'idle', vendorStatus: status }
  }
  if (status === 'running' || status === 'starting' || status === 'pending') {
    return { state: 'working', vendorStatus: status }
  }
  if (
    status === 'requires_action' ||
    status === 'paused' ||
    status === 'waiting_for_confirmation'
  ) {
    return { state: 'blocked', vendorStatus: status }
  }
  if (
    status === 'error' ||
    status === 'failed' ||
    status === 'terminated' ||
    status === 'archived'
  ) {
    return { state: 'ended', vendorStatus: status }
  }
  return { state: 'idle', vendorStatus: status }
}

function agentOf(raw: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(raw.agent) ? raw.agent : null
}

export function rowOf(raw: Record<string, unknown>): CloudAgentSessionRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  if (!id) {
    return null
  }
  const agent = agentOf(raw)
  const model = agent && isRecord(agent.model) ? agent.model : null
  const { state, vendorStatus } = stateOf(raw)
  const created = typeof raw.created_at === 'string' ? raw.created_at : null
  const updated = typeof raw.updated_at === 'string' ? raw.updated_at : created
  const title =
    typeof raw.title === 'string' && raw.title.length > 0
      ? raw.title
      : agent && typeof agent.name === 'string' && agent.name.length > 0
        ? agent.name
        : null
  return {
    provider: PROVIDER,
    id,
    title,
    state,
    vendorStatus,
    archived: typeof raw.archived_at === 'string' || state === 'ended',
    agentId: agent && typeof agent.id === 'string' ? agent.id : null,
    agentVersion: agent && typeof agent.version === 'number' ? agent.version : null,
    model: model && typeof model.id === 'string' ? model.id : null,
    environmentId: typeof raw.environment_id === 'string' ? raw.environment_id : null,
    createdAt: created,
    updatedAt: updated,
    url: `https://platform.claude.com/sessions/${id}`,
    totalCredits: null
  }
}

function stopReasonOf(raw: Record<string, unknown>): {
  type: string
  event_ids?: string[]
} | null {
  const reason = isRecord(raw.stop_reason) ? raw.stop_reason : null
  if (!reason || typeof reason.type !== 'string') {
    return null
  }
  const ids = Array.isArray(reason.event_ids)
    ? reason.event_ids.filter((id): id is string => typeof id === 'string')
    : []
  return ids.length > 0 ? { type: reason.type, event_ids: ids } : { type: reason.type }
}

export function eventOf(raw: Record<string, unknown>): CloudAgentEvent {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const at = typeof raw.processed_at === 'string' ? raw.processed_at : new Date(0).toISOString()
  const base = { id, processed_at: at }
  const type = typeof raw.type === 'string' ? raw.type : ''

  switch (type) {
    case 'user.message':
      return { ...base, type: 'user.message', content: contentOf(raw.content) }
    case 'agent.message':
      return { ...base, type: 'agent.message', content: contentOf(raw.content) }
    case 'agent.thinking':
      return { ...base, type: 'agent.thinking' }
    case 'agent.tool_use':
      return {
        ...base,
        type: 'agent.tool_use',
        name: typeof raw.name === 'string' ? raw.name : 'tool',
        input: raw.input ?? null,
        evaluated_permission:
          typeof raw.evaluated_permission === 'string' ? raw.evaluated_permission : null
      }
    case 'agent.tool_result': {
      const blocks = contentOf(raw.content)
      return {
        ...base,
        type: 'agent.tool_result',
        tool_use_id: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : '',
        content: blocks,
        is_error: raw.is_error === true
      }
    }
    case 'agent.custom_tool_use':
      return {
        ...base,
        type: 'agent.custom_tool_use',
        name: typeof raw.name === 'string' ? raw.name : 'tool',
        input: raw.input ?? null,
        title: typeof raw.title === 'string' ? raw.title : null
      }
    case 'user.custom_tool_result':
      return {
        ...base,
        type: 'user.custom_tool_result',
        tool_use_id: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : '',
        content: contentOf(raw.content)
      }
    case 'user.define_outcome':
      return {
        ...base,
        type: 'user.define_outcome',
        outcome_id: typeof raw.outcome_id === 'string' ? raw.outcome_id : '',
        description: typeof raw.description === 'string' ? raw.description : '',
        rubric: isRecord(raw.rubric) ? null : null,
        max_iterations: typeof raw.max_iterations === 'number' ? raw.max_iterations : null
      }
    case 'session.status_running':
      return { ...base, type: 'session.status_running' }
    case 'session.status_idle':
      return { ...base, type: 'session.status_idle', stop_reason: stopReasonOf(raw) }
    case 'session.thread_status_running':
      return {
        ...base,
        type: 'session.thread_status_running',
        agent_name: typeof raw.agent_name === 'string' ? raw.agent_name : null
      }
    case 'session.thread_status_idle':
      return {
        ...base,
        type: 'session.thread_status_idle',
        agent_name: typeof raw.agent_name === 'string' ? raw.agent_name : null,
        stop_reason: stopReasonOf(raw)
      }
    case 'span.model_request_start':
      return { ...base, type: 'span.model_request_start' }
    case 'span.model_request_end':
      return {
        ...base,
        type: 'span.model_request_end',
        is_error: raw.is_error === true,
        credits: null
      }
    case 'session.usage':
      return { ...base, type: 'session.usage', total_credits: null }
    case 'session.error': {
      const error = isRecord(raw.error) ? raw.error : {}
      const retry = isRecord(error.retry_status) ? error.retry_status : null
      return {
        ...base,
        type: 'session.error',
        error_type: typeof error.type === 'string' ? error.type : 'error',
        message: typeof error.message === 'string' ? error.message : '',
        server: typeof error.mcp_server_name === 'string' ? error.mcp_server_name : null,
        retry: retry && typeof retry.type === 'string' ? retry.type : null
      }
    }
    default:
      return { ...base, type: 'other', rawType: type }
  }
}
