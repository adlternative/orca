import { CredentialDecryptionError } from '../integration-credential-file'
import {
  QODER_CLOUD_DEFAULT_API_BASE_URL,
  type QoderCloudConnectArgs,
  type QoderCloudConnectResult,
  type QoderCloudConnectionStatus,
  type QoderCloudGetSessionResult,
  type QoderCloudListEventsArgs,
  type QoderCloudListEventsResult,
  type QoderCloudListSessionsArgs,
  type QoderCloudListSessionsResult,
  type QoderCloudRequestFailure
} from '../../shared/qoder-cloud-types'
import {
  getQoderCloudSession,
  listQoderCloudEvents,
  listQoderCloudSessions,
  refineRunningSessionsByTail,
  verifyQoderCloudCredential
} from './client'
import { resolveQoderCloudFileLink } from './files'
import { listQoderCloudDeploymentRuns, listQoderCloudDeployments } from './deployments'
import {
  archiveQoderCloudSession,
  cancelQoderCloudTurn,
  sendQoderCloudEvents
} from './session-actions'
import { loadQoderCloudCatalog } from './catalog'
import {
  listCloudAgentModels,
  setCloudAgentSessionModel,
  type ListModelsResult,
  type SetModelResult
} from './models'
import type { SetCloudAgentModelInput } from '../../shared/cloud-agent-model'
import { createQoderCloudSession } from './create-session'
import type {
  CloudAgentCatalogResult,
  CloudAgentCreateResult,
  NewCloudSessionInput
} from '../../shared/cloud-agent-create'
import type {
  CloudAgentActionFailure,
  CloudAgentActionResult,
  CloudAgentFileLinkResult,
  CloudAgentListScheduleRunsResult,
  CloudAgentListSchedulesResult,
  CloudAgentSessionAction
} from '../../shared/cloud-agent-provider'
import {
  clearStoredQoderCloudCredential,
  getEnvQoderCloudAuthConfig,
  getStoredQoderCloudCredentialError,
  getStoredQoderCloudMetadata,
  hasStoredQoderCloudCredential,
  loadStoredQoderCloudToken,
  saveQoderCloudCredential,
  type QoderCloudAuthConfig
} from './credential-store'

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const candidate = normalize(value)
  if (!candidate) {
    return QODER_CLOUD_DEFAULT_API_BASE_URL
  }
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }
  // Why: a token goes in the Authorization header of every request; never let it ride plain HTTP.
  return parsed.protocol === 'https:' ? candidate.replace(/\/+$/, '') : null
}

const NOT_CONFIGURED: QoderCloudRequestFailure = {
  ok: false,
  reason: 'not-configured',
  message: 'Connect Qoder Cloud Agents in Settings first.'
}

/** Env first, then the stored credential. Decrypting is expected here: a caller wants to act. */
function resolveAuthConfig(): QoderCloudAuthConfig | QoderCloudRequestFailure {
  const env = getEnvQoderCloudAuthConfig()
  if (env) {
    return env
  }
  const metadata = getStoredQoderCloudMetadata()
  if (!metadata) {
    return NOT_CONFIGURED
  }
  try {
    const accessToken = loadStoredQoderCloudToken({ force: true })
    if (!accessToken) {
      return NOT_CONFIGURED
    }
    return { baseUrl: metadata.baseUrl, accessToken }
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      return { ok: false, reason: 'rejected', message: error.message }
    }
    throw error
  }
}

/** Config for a background consumer; null rather than a failure object when nothing is usable. */
export function resolveQoderCloudAuthConfigOrNull(): QoderCloudAuthConfig | null {
  const config = resolveAuthConfig()
  return 'ok' in config ? null : config
}

export function getQoderCloudConnectionStatus(): QoderCloudConnectionStatus {
  const env = getEnvQoderCloudAuthConfig()
  if (env) {
    return {
      configured: true,
      source: 'environment',
      baseUrl: env.baseUrl,
      credentialError: null
    }
  }
  if (hasStoredQoderCloudCredential()) {
    return {
      configured: true,
      source: 'stored',
      baseUrl: getStoredQoderCloudMetadata()?.baseUrl ?? null,
      credentialError: getStoredQoderCloudCredentialError()
    }
  }
  return {
    configured: false,
    source: 'none',
    baseUrl: null,
    credentialError: null
  }
}

/** Proves the token against the API before persisting, so "connected" is never a lie. */
export async function connectQoderCloud(
  input: QoderCloudConnectArgs
): Promise<QoderCloudConnectResult> {
  const accessToken = normalize(input.accessToken)
  if (!accessToken) {
    return { ok: false, error: 'Enter a Qoder access token.' }
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  if (!baseUrl) {
    return { ok: false, error: 'The API base URL must be an https:// URL.' }
  }
  const config: QoderCloudAuthConfig = { baseUrl, accessToken }
  const verified = await verifyQoderCloudCredential(config)
  if (!verified.ok) {
    return {
      ok: false,
      error:
        verified.reason === 'rejected'
          ? 'Qoder rejected this token. Check that it is a valid PAT or SAT.'
          : `Could not reach Qoder Cloud to verify the token: ${verified.message}`
    }
  }
  saveQoderCloudCredential(config)
  return { ok: true }
}

export function disconnectQoderCloud(): void {
  clearStoredQoderCloudCredential()
}

export async function listSessions(
  args: QoderCloudListSessionsArgs
): Promise<QoderCloudListSessionsResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  const result = await listQoderCloudSessions(config, args)
  if (!result.ok) {
    return result
  }
  return {
    ok: true,
    page: {
      ...result.page,
      sessions: await refineRunningSessionsByTail(config, result.page.sessions)
    }
  }
}

export async function listEvents(
  args: QoderCloudListEventsArgs
): Promise<QoderCloudListEventsResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return listQoderCloudEvents(config, args)
}

export async function listModels(): Promise<ListModelsResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return listCloudAgentModels(config)
}

export async function setSessionModel(input: SetCloudAgentModelInput): Promise<SetModelResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return setCloudAgentSessionModel(config, input)
}

export async function getSession(sessionId: string): Promise<QoderCloudGetSessionResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return getQoderCloudSession(config, sessionId)
}

export async function fileLink(fileId: string): Promise<CloudAgentFileLinkResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return resolveQoderCloudFileLink(config, fileId)
}

export async function listSchedules(args: {
  page?: string | null
  limit?: number | null
}): Promise<CloudAgentListSchedulesResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return listQoderCloudDeployments(config, args)
}

export async function listScheduleRuns(args: {
  scheduleId: string
  page?: string | null
  limit?: number | null
}): Promise<CloudAgentListScheduleRunsResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return listQoderCloudDeploymentRuns(config, args)
}

/**
 * Apply a write to a session. The capability gate lives here as well as in the UI: a caller
 * that reaches this function directly must not be able to send to a provider that declared
 * the action unsupported.
 */
export async function runSessionAction(
  sessionId: string,
  action: CloudAgentSessionAction
): Promise<CloudAgentActionResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  switch (action.kind) {
    case 'send-message': {
      const text = action.text.trim()
      if (!text) {
        return {
          ok: false,
          reason: 'malformed',
          message: 'A message is required.'
        }
      }
      return sendQoderCloudEvents(config, sessionId, [
        { type: 'user.message', content: [{ type: 'text', text }] }
      ])
    }
    case 'confirm-tool':
      return sendQoderCloudEvents(config, sessionId, [
        {
          type: 'user.tool_confirmation',
          tool_use_id: action.toolUseId,
          result: action.decision
        }
      ])
    case 'cancel-turn':
      return cancelQoderCloudTurn(config, sessionId)
    case 'archive':
      return archiveQoderCloudSession(config, sessionId)
  }
}

export type { CloudAgentActionFailure }

export async function loadCatalog(): Promise<CloudAgentCatalogResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return loadQoderCloudCatalog(config)
}

export async function createSession(input: NewCloudSessionInput): Promise<CloudAgentCreateResult> {
  const config = resolveAuthConfig()
  if ('ok' in config) {
    return config
  }
  return createQoderCloudSession(config, input)
}
