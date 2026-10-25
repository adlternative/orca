import {
  connectQoderCloud,
  disconnectQoderCloud,
  fileLink,
  getQoderCloudConnectionStatus,
  getSession,
  listEvents,
  listScheduleRuns,
  listSchedules,
  listSessions,
  loadCatalog,
  createSession,
  resolveQoderCloudAuthConfigOrNull,
  runSessionAction
} from '../qoder-cloud/connection'
import { QoderCloudStreamManager } from '../qoder-cloud/stream-manager'
import {
  isQoderCloudSessionStatus,
  type QoderCloudConnectArgs,
  type QoderCloudConnectResult,
  type QoderCloudConnectionStatus,
  type QoderCloudGetSessionResult,
  type QoderCloudListEventsArgs,
  type QoderCloudListEventsResult,
  type QoderCloudListSessionsArgs,
  type QoderCloudListSessionsResult,
  type QoderCloudSessionStatus
} from '../../shared/qoder-cloud-types'
import type {
  CloudAgentCatalogResult,
  CloudAgentCreateResult
} from '../../shared/cloud-agent-create'
import {
  isRecord as isRecordBase,
  optionalString as optionalStringBase
} from '../qoder-cloud/client'
import { listModels, setSessionModel } from '../qoder-cloud/connection'
import type { CloudAgentAdapter } from './adapter'
import { normalizeCreateInput } from './create-input'
import type { SetCloudAgentModelInput } from '../../shared/cloud-agent-model'
import type {
  CloudAgentActionResult,
  CloudAgentSessionAction,
  CloudAgentFileLinkResult,
  CloudAgentListScheduleRunsResult,
  CloudAgentListSchedulesResult
} from '../../shared/cloud-agent-provider'

const optionalString = optionalStringBase
const isRecord = isRecordBase

function normalizeConnectInput(value: unknown): QoderCloudConnectArgs | null {
  if (!isRecord(value)) {
    return null
  }
  return { accessToken: optionalString(value.accessToken), baseUrl: optionalString(value.baseUrl) }
}

function normalizeListInput(raw: unknown): QoderCloudListSessionsArgs {
  if (!isRecord(raw)) {
    return {}
  }
  const statuses = Array.isArray(raw.statuses)
    ? raw.statuses.filter((status): status is QoderCloudSessionStatus =>
        isQoderCloudSessionStatus(status)
      )
    : null
  return {
    page: optionalString(raw.page),
    limit: typeof raw.limit === 'number' ? raw.limit : null,
    statuses: statuses && statuses.length > 0 ? statuses : null
  }
}

function normalizeEventsInput(raw: unknown): QoderCloudListEventsArgs | null {
  if (!isRecord(raw) || typeof raw.sessionId !== 'string' || raw.sessionId.length === 0) {
    return null
  }
  return {
    sessionId: raw.sessionId,
    page: optionalString(raw.page),
    limit: typeof raw.limit === 'number' ? raw.limit : null,
    order: raw.order === 'asc' || raw.order === 'desc' ? raw.order : null
  }
}

function normalizeAction(value: unknown): CloudAgentSessionAction | null {
  if (!isRecord(value)) {
    return null
  }
  switch (value.kind) {
    case 'send-message':
      return typeof value.text === 'string' ? { kind: 'send-message', text: value.text } : null
    case 'confirm-tool':
      return typeof value.toolUseId === 'string' &&
        (value.decision === 'allow' || value.decision === 'deny')
        ? { kind: 'confirm-tool', toolUseId: value.toolUseId, decision: value.decision }
        : null
    case 'cancel-turn':
      return { kind: 'cancel-turn' }
    case 'archive':
      return { kind: 'archive' }
    default:
      return null
  }
}
let streamManager: QoderCloudStreamManager | null = null

function streams(): QoderCloudStreamManager {
  streamManager ??= new QoderCloudStreamManager(resolveQoderCloudAuthConfigOrNull)
  return streamManager
}

function normalizeModelInput(raw: unknown): SetCloudAgentModelInput | null {
  if (
    !isRecord(raw) ||
    typeof raw.sessionId !== 'string' ||
    raw.sessionId.length === 0 ||
    typeof raw.modelId !== 'string' ||
    raw.modelId.length === 0
  ) {
    return null
  }
  return {
    sessionId: raw.sessionId,
    modelId: raw.modelId,
    effort: optionalString(raw.effort),
    contextWindow: typeof raw.contextWindow === 'number' ? raw.contextWindow : null
  }
}

export const qoderCloudAdapter: CloudAgentAdapter = {
  provider: 'qoder-cloud',
  status: async (): Promise<QoderCloudConnectionStatus> => getQoderCloudConnectionStatus(),
  connect: async (raw): Promise<QoderCloudConnectResult> => {
    const input = normalizeConnectInput(raw)
    return input
      ? connectQoderCloud(input)
      : { ok: false, error: 'Invalid Qoder Cloud credentials' }
  },
  disconnect: async (): Promise<void> => {
    // Why: a disconnected credential must not keep live streams open against the vendor.
    streams().closeAll()
    disconnectQoderCloud()
  },
  catalog: async (): Promise<CloudAgentCatalogResult> => loadCatalog(),
  listSessions: async (raw): Promise<QoderCloudListSessionsResult> =>
    listSessions(normalizeListInput(raw)),
  getSession: async (raw): Promise<QoderCloudGetSessionResult> => {
    if (typeof raw !== 'string' || raw.length === 0) {
      return { ok: false, reason: 'malformed', message: 'A session id is required.' }
    }
    return getSession(raw)
  },
  listEvents: async (raw): Promise<QoderCloudListEventsResult> => {
    const input = normalizeEventsInput(raw)
    if (!input) {
      return { ok: false, reason: 'malformed', message: 'A session id is required.' }
    }
    return listEvents(input)
  },
  listModels: async (): Promise<unknown> => listModels(),
  setSessionModel: async (raw): Promise<unknown> => {
    const input = normalizeModelInput(raw)
    if (!input) {
      return { ok: false, reason: 'malformed', message: 'A session id and model id are required.' }
    }
    return setSessionModel(input)
  },
  createSession: async (raw): Promise<CloudAgentCreateResult> => {
    const input = normalizeCreateInput(raw, 'qoder-cloud')
    return input
      ? createSession(input)
      : { ok: false, reason: 'malformed', message: 'Invalid new-session request.' }
  },
  sessionAction: async (raw): Promise<CloudAgentActionResult> => {
    if (!isRecord(raw) || typeof raw.sessionId !== 'string' || raw.sessionId.length === 0) {
      return { ok: false, reason: 'malformed', message: 'A session id is required.' }
    }
    const action = normalizeAction(raw.action)
    if (!action) {
      return { ok: false, reason: 'malformed', message: 'Unknown session action.' }
    }
    return runSessionAction(raw.sessionId, action)
  },
  listSchedules: async (raw): Promise<CloudAgentListSchedulesResult> => {
    const input = isRecord(raw) ? raw : {}
    return listSchedules({
      page: optionalString(input.page),
      limit: typeof input.limit === 'number' ? input.limit : null
    })
  },
  listScheduleRuns: async (raw): Promise<CloudAgentListScheduleRunsResult> => {
    if (!isRecord(raw) || typeof raw.scheduleId !== 'string' || raw.scheduleId.length === 0) {
      return { ok: false, reason: 'malformed', message: 'A schedule id is required.' }
    }
    return listScheduleRuns({
      scheduleId: raw.scheduleId,
      page: optionalString(raw.page),
      limit: typeof raw.limit === 'number' ? raw.limit : null
    })
  },
  fileLink: async (raw): Promise<CloudAgentFileLinkResult> => {
    if (typeof raw !== 'string' || raw.length === 0) {
      return { ok: false, reason: 'malformed', message: 'A file id is required.' }
    }
    return fileLink(raw)
  },
  streamSubscribe: async (raw): Promise<void> => {
    if (!isRecord(raw) || typeof raw.sessionId !== 'string' || raw.sessionId.length === 0) {
      return
    }
    streams().subscribe(raw.sessionId, optionalString(raw.lastEventId))
  },
  streamUnsubscribe: async (raw): Promise<void> => {
    if (typeof raw === 'string') {
      streams().unsubscribe(raw)
    }
  }
}
