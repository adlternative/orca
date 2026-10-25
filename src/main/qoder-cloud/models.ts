import type { CloudAgentModel, SetCloudAgentModelInput } from '../../shared/cloud-agent-model'
import type { CloudAgentRequestFailure } from '../../shared/cloud-agent-provider'
import { isRecord, requestJson } from './client'
import type { QoderCloudAuthConfig } from './credential-store'

export type ListModelsResult = { ok: true; models: CloudAgentModel[] } | CloudAgentRequestFailure
export type SetModelResult = { ok: true; modelId: string } | CloudAgentRequestFailure

/**
 * Beta flag the vendor requires before `agent.model` may be patched on a live session.
 * Without it the update is rejected as an unknown field.
 */
const SESSION_AGENT_PATCH_BETA = 'session-agent-patch-2026-07-21'

/** Vendor orderings, so a picker never renders `max, low, high` as the vendor advertised them. */
const EFFORT_ORDER = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function numberList(value: unknown): number[] {
  const numbers = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : []
  return [...new Set(numbers)].sort((a, b) => a - b)
}

export function parseCloudAgentModel(value: unknown): CloudAgentModel | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  if (!id) {
    return null
  }
  const efforts = stringList(value.efforts)
  return {
    id,
    displayName: optionalString(value.display_name) ?? id,
    priceFactor: optionalNumber(value.price_factor),
    vision: value.is_vl === true,
    efforts: [...efforts].sort(
      (a, b) => EFFORT_ORDER.indexOf(a as never) - EFFORT_ORDER.indexOf(b as never)
    ),
    defaultEffort: optionalString(value.default_effort),
    contextWindows: numberList(value.available_context_windows)
  }
}

export function parseCloudAgentModelPage(value: unknown): CloudAgentModel[] | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null
  }
  const models: CloudAgentModel[] = []
  for (const item of value.data) {
    // Why: a disabled model cannot run a turn, so offering it would only produce a failed switch.
    if (isRecord(item) && item.is_enabled === false) {
      continue
    }
    const model = parseCloudAgentModel(item)
    if (model) {
      models.push(model)
    }
  }
  return models
}

export async function listCloudAgentModels(
  config: QoderCloudAuthConfig
): Promise<ListModelsResult> {
  const result = await requestJson(config, '/models')
  if (!result.ok) {
    return result
  }
  const models = parseCloudAgentModelPage(result.body)
  if (!models) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unreadable model list.'
    }
  }
  return { ok: true, models }
}

/**
 * Switches the model of a live session for its subsequent turns.
 *
 * Why a session patch and not the agent: sessions pin an agent version, so editing the agent would
 * spawn a version other sessions do not use. This patches the session's own runtime snapshot.
 */
export async function setCloudAgentSessionModel(
  config: QoderCloudAuthConfig,
  input: SetCloudAgentModelInput
): Promise<SetModelResult> {
  const effort = optionalString(input.effort)
  const contextWindow = optionalNumber(input.contextWindow)
  const model: Record<string, unknown> = { id: input.modelId }
  if (effort) {
    model.effort = effort
  }
  if (contextWindow !== null) {
    model.context_window = contextWindow
  }
  const result = await requestJson(
    config,
    `/sessions/${encodeURIComponent(input.sessionId)}`,
    undefined,
    {
      method: 'POST',
      body: { agent: { model } },
      headers: { 'x-qoder-beta': SESSION_AGENT_PATCH_BETA }
    }
  )
  if (!result.ok) {
    return result
  }
  const session = isRecord(result.body) ? result.body : null
  const agent = session && isRecord(session.agent) ? session.agent : null
  const applied = agent && isRecord(agent.model) ? optionalString(agent.model.id) : null
  if (!applied) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud did not confirm the model switch.'
    }
  }
  return { ok: true, modelId: applied }
}
