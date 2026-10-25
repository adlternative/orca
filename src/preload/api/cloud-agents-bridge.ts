import { ipcRenderer } from 'electron'
import type {
  QoderCloudListEventsArgs,
  QoderCloudListSessionsArgs,
  QoderCloudStreamPush
} from '../../shared/qoder-cloud-types'
import type { CloudAgentStreamPush, CloudAgentStreamState } from '../../shared/cloud-agent-stream'
import type { CloudAgentApi } from './cloud-agent-api'

/**
 * Binds the generic cloud-agent channels to one provider.
 *
 * Why a factory: the renderer talks to sessions, not to vendors. Every call carries the provider of
 * the row it came from, so two providers can be on screen at once; `qoderCloudApi` is just this
 * factory with the first provider baked in for call sites that have no row (settings, creation).
 */
export function makeCloudAgentApi(provider: string): CloudAgentApi {
  const call = (op: string, args?: unknown): Promise<never> =>
    ipcRenderer.invoke(`cloudAgent:${op}`, { provider, args }) as Promise<never>

  return {
    connect: (args) => call('connect', args),
    disconnect: () => call('disconnect'),
    status: () => call('status'),
    listSessions: (args: QoderCloudListSessionsArgs = {}) => call('listSessions', args),
    getSession: (sessionId: string) => call('getSession', sessionId),
    listEvents: (args: QoderCloudListEventsArgs) => call('listEvents', args),
    fileLink: (fileId: string) => call('fileLink', fileId),
    catalog: () => call('catalog'),
    listModels: () => call('listModels'),
    setSessionModel: (args) => call('setSessionModel', args),
    createSession: (input) => call('createSession', input),
    sessionAction: (args) => call('sessionAction', args),
    listSchedules: (args = {}) => call('listSchedules', args),
    listScheduleRuns: (args) => call('listScheduleRuns', args),
    streamSubscribe: (args: { sessionId: string; lastEventId: string | null }) =>
      call('streamSubscribe', args),
    streamUnsubscribe: (sessionId: string) => call('streamUnsubscribe', sessionId),
    onStreamEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, push: CloudAgentStreamPush): void => {
        // Why the filter: the channel is shared, so an unrelated vendor's push must not be decoded.
        // Why the cast: the provider tag is what makes the payload's vendor shape known here.
        if (push.provider === provider) {
          callback(push as QoderCloudStreamPush)
        }
      }
      ipcRenderer.on('cloudAgent:streamEvent', listener)
      return () => ipcRenderer.removeListener('cloudAgent:streamEvent', listener)
    },
    onStreamState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: CloudAgentStreamState): void => {
        if (state.provider === provider) {
          callback(state)
        }
      }
      ipcRenderer.on('cloudAgent:streamState', listener)
      return () => ipcRenderer.removeListener('cloudAgent:streamState', listener)
    }
  }
}
