import type { CloudAgentCreateResult, NewCloudSessionInput } from '../../shared/cloud-agent-create'
import { isRecord, optionalString, requestJson } from './client'
import type { QoderCloudAuthConfig } from './credential-store'
import { QODER_CLOUD_PROVIDER_ID } from '../../shared/qoder-cloud-types'
import { sendQoderCloudEvents, type QoderCloudClientEvent } from './session-actions'

// Creating a session: one POST for the container, resources and vaults, then one event POST that
// starts the first turn. Kept separate because the two can diverge — a created session whose
// first turn failed is a real state the UI has to report rather than hide.

type CreateBody = {
  agent: { id: string; type: 'agent'; version: number }
  environment_id: string
  title?: string
  metadata: Record<string, string>
  resources: unknown[]
  vault_ids?: string[]
}

export function buildQoderCreateBody(input: NewCloudSessionInput): CreateBody {
  const resources: unknown[] = []
  if (input.repository) {
    resources.push({
      type: 'github_repository',
      url: input.repository.url.trim(),
      ...(input.repository.mountPath.trim()
        ? { mount_path: input.repository.mountPath.trim() }
        : {}),
      ...(input.repository.authorizationToken.trim()
        ? { authorization_token: input.repository.authorizationToken.trim() }
        : {})
    })
  }
  for (const store of input.memoryStores) {
    resources.push({
      type: 'memory_store',
      memory_store_id: store.id,
      access: store.access,
      ...(store.instructions.trim() ? { instructions: store.instructions.trim() } : {})
    })
  }
  return {
    agent: { id: input.templateId, type: 'agent', version: input.templateVersion },
    environment_id: input.environmentId,
    ...(input.title.trim() ? { title: input.title.trim() } : {}),
    // Why: marks the session as Orca-created so it is identifiable in the vendor console.
    metadata: { source: 'orca', provider: QODER_CLOUD_PROVIDER_ID },
    resources,
    ...(input.vaultIds.length > 0 ? { vault_ids: input.vaultIds } : {})
  }
}

export function firstTurnEvent(input: NewCloudSessionInput): QoderCloudClientEvent[] {
  if (input.outcome && input.outcome.rubric.trim()) {
    // Why: an Outcome runs the description as its own turn and grades it; sending a second
    // user.message as well would start two turns and the vendor answers the second with 409.
    return [
      {
        type: 'user.define_outcome',
        description: input.prompt.trim() || input.outcome.rubric.trim(),
        rubric: { type: 'text', content: input.outcome.rubric.trim() },
        max_iterations: input.outcome.maxIterations
      }
    ]
  }
  return input.prompt.trim()
    ? [{ type: 'user.message', content: [{ type: 'text', text: input.prompt.trim() }] }]
    : []
}

export async function createQoderCloudSession(
  config: QoderCloudAuthConfig,
  input: NewCloudSessionInput
): Promise<CloudAgentCreateResult> {
  const created = await requestJson(config, '/sessions', undefined, {
    method: 'POST',
    body: buildQoderCreateBody(input)
  })
  if (!created.ok) {
    return created
  }
  const sessionId = isRecord(created.body) ? optionalString(created.body.id) : null
  if (!sessionId) {
    return { ok: false, reason: 'malformed', message: 'Qoder Cloud did not return a session id.' }
  }
  const events = firstTurnEvent(input)
  if (events.length === 0) {
    return { ok: true, sessionId, promptSent: false }
  }
  const sent = await sendQoderCloudEvents(config, sessionId, events)
  return sent.ok
    ? { ok: true, sessionId, promptSent: true }
    : {
        ok: true,
        sessionId,
        promptSent: false,
        promptError: sent.message
      }
}
