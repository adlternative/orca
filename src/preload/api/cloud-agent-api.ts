import type {
  QoderCloudConnectArgs,
  QoderCloudConnectResult,
  QoderCloudConnectionStatus,
  QoderCloudGetSessionResult,
  QoderCloudListEventsArgs,
  QoderCloudListEventsResult,
  QoderCloudListSessionsArgs,
  QoderCloudListSessionsResult,
  QoderCloudStreamPush,
  QoderCloudStreamState
} from '../../shared/qoder-cloud-types'
import type {
  CloudAgentCatalogResult,
  CloudAgentCreateResult,
  NewCloudSessionInput
} from '../../shared/cloud-agent-create'
import type { CloudAgentModel, SetCloudAgentModelInput } from '../../shared/cloud-agent-model'
import type {
  CloudAgentActionResult,
  CloudAgentRequestFailure,
  CloudAgentSessionAction,
  CloudAgentFileLinkResult,
  CloudAgentListScheduleRunsResult,
  CloudAgentListSchedulesResult
} from '../../shared/cloud-agent-provider'

export type CloudAgentApi = {
  connect: (args: QoderCloudConnectArgs) => Promise<QoderCloudConnectResult>
  disconnect: () => Promise<void>
  status: () => Promise<QoderCloudConnectionStatus>
  listSessions: (args?: QoderCloudListSessionsArgs) => Promise<QoderCloudListSessionsResult>
  getSession: (sessionId: string) => Promise<QoderCloudGetSessionResult>
  listEvents: (args: QoderCloudListEventsArgs) => Promise<QoderCloudListEventsResult>
  fileLink: (fileId: string) => Promise<CloudAgentFileLinkResult>
  catalog: () => Promise<CloudAgentCatalogResult>
  listModels: () => Promise<{ ok: true; models: CloudAgentModel[] } | CloudAgentRequestFailure>
  setSessionModel: (
    args: SetCloudAgentModelInput
  ) => Promise<{ ok: true; modelId: string } | CloudAgentRequestFailure>
  createSession: (input: NewCloudSessionInput) => Promise<CloudAgentCreateResult>
  sessionAction: (args: {
    sessionId: string
    action: CloudAgentSessionAction
  }) => Promise<CloudAgentActionResult>
  listSchedules: (args?: {
    page?: string | null
    limit?: number | null
  }) => Promise<CloudAgentListSchedulesResult>
  listScheduleRuns: (args: {
    scheduleId: string
    page?: string | null
    limit?: number | null
  }) => Promise<CloudAgentListScheduleRunsResult>
  streamSubscribe: (args: { sessionId: string; lastEventId: string | null }) => Promise<void>
  streamUnsubscribe: (sessionId: string) => Promise<void>
  onStreamEvent: (callback: (push: QoderCloudStreamPush) => void) => () => void
  onStreamState: (callback: (state: QoderCloudStreamState) => void) => () => void
}

/** Kept as an alias so a call site that names the first vendor does not fork the type. */
export type QoderCloudApi = CloudAgentApi
