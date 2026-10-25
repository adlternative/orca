import {
  OPENHANDS_CLOUD_DEFAULT_API_BASE_URL,
  OPENHANDS_CLOUD_PROVIDER_ID
} from '../../shared/openhands-cloud'
import type {
  CloudAgentSessionRow,
  CloudAgentSessionState
} from '../../shared/cloud-agent-provider'
import type { CloudAgentEvent } from '../../shared/cloud-agent-events'

/**
 * OpenHands wire format ⇄ the canonical cloud-agent model.
 *
 * Why its own module: this is exactly what a vendor owns — how its two status axes and its event
 * kinds line up with the states and events the rest of Orca already renders.
 */
const PROVIDER = OPENHANDS_CLOUD_PROVIDER_ID

export function openhandsBaseUrl(): string {
  const value = process.env.ORCA_OPENHANDS_BASE_URL
  return (
    value && value.trim().length > 0 ? value.trim() : OPENHANDS_CLOUD_DEFAULT_API_BASE_URL
  ).replace(/\/+$/, '')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const itemsOf = (body: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.items)
      ? body.items
      : []
  return list.filter(isRecord)
}

export function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value)) {
    const content = value.content
    if (Array.isArray(content)) {
      return content.map((b) => (isRecord(b) && typeof b.text === 'string' ? b.text : '')).join('')
    }
    if (typeof value.text === 'string') {
      return value.text
    }
  }
  return ''
}

export { itemsOf }

export function stateOf(raw: Record<string, unknown>): {
  state: CloudAgentSessionState
  vendorStatus: string
} {
  const execution = typeof raw.execution_status === 'string' ? raw.execution_status : ''
  const sandbox = typeof raw.sandbox_status === 'string' ? raw.sandbox_status : ''
  const vendorStatus = [sandbox, execution].filter(Boolean).join(' / ') || 'unknown'

  if (
    sandbox === 'ERROR' ||
    sandbox === 'MISSING' ||
    execution === 'error' ||
    execution === 'stuck'
  ) {
    return { state: 'ended', vendorStatus }
  }
  if (execution === 'running') {
    return { state: 'working', vendorStatus }
  }
  if (execution === 'paused' || execution === 'waiting' || sandbox === 'PAUSED') {
    return { state: 'blocked', vendorStatus }
  }
  return { state: 'idle', vendorStatus }
}

export function rowOf(raw: Record<string, unknown>): CloudAgentSessionRow | null {
  const id =
    typeof raw.app_conversation_id === 'string'
      ? raw.app_conversation_id
      : typeof raw.id === 'string'
        ? raw.id
        : null
  if (!id) {
    return null
  }
  const { state, vendorStatus } = stateOf(raw)
  const created = typeof raw.created_at === 'string' ? raw.created_at : null
  const updated = typeof raw.updated_at === 'string' ? raw.updated_at : created
  return {
    provider: PROVIDER,
    id,
    title: typeof raw.title === 'string' && raw.title.length > 0 ? raw.title : null,
    state,
    vendorStatus,
    archived: state === 'ended',
    agentId: typeof raw.selected_repository === 'string' ? raw.selected_repository : null,
    agentVersion: null,
    model: null,
    environmentId: typeof raw.sandbox_id === 'string' ? raw.sandbox_id : null,
    createdAt: created,
    updatedAt: updated,
    url: `${openhandsBaseUrl()}/conversations/${id}`,
    totalCredits: null
  }
}

export function eventOf(raw: Record<string, unknown>): CloudAgentEvent {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const at = typeof raw.timestamp === 'string' ? raw.timestamp : new Date(0).toISOString()
  const base = { id, processed_at: at }
  const kind = typeof raw.kind === 'string' ? raw.kind : ''
  const source = typeof raw.source === 'string' ? raw.source : ''

  if (kind === 'MessageEvent') {
    const text = textOf(raw.message ?? raw.llm_message ?? raw)
    const content = [{ type: 'text' as const, text }]
    return source === 'user'
      ? { ...base, type: 'user.message', content }
      : { ...base, type: 'agent.message', content }
  }
  if (kind === 'ActionEvent' && isRecord(raw.action)) {
    return {
      ...base,
      type: 'agent.tool_use',
      name: typeof raw.action.kind === 'string' ? raw.action.kind : 'tool',
      input: raw.action,
      evaluated_permission: null
    }
  }
  if (kind === 'ObservationEvent') {
    return {
      ...base,
      type: 'agent.tool_result',
      tool_use_id: typeof raw.action_id === 'string' ? raw.action_id : '',
      content: [{ type: 'text', text: textOf(raw.observation) }],
      is_error: isRecord(raw.observation) && raw.observation.is_error === true
    }
  }
  if (kind === 'ConversationStateUpdateEvent') {
    const execution = typeof raw.value === 'string' ? raw.value : ''
    return execution === 'running'
      ? { ...base, type: 'session.status_running' }
      : { ...base, type: 'session.status_idle', stop_reason: null }
  }
  if (kind === 'AgentErrorEvent') {
    return {
      ...base,
      type: 'session.error',
      error_type: 'agent',
      message: textOf(raw.error ?? raw),
      server: null,
      retry: null
    }
  }
  return { ...base, type: 'other', rawType: kind }
}
