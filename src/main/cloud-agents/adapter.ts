import type { CloudAgentProviderId } from '../../shared/cloud-agent-provider'

/**
 * One vendor behind the generic cloud-agent IPC surface.
 *
 * The IPC layer is a dumb relay: it forwards whatever the renderer sent and lets the adapter
 * normalize it, so a malformed request still becomes that vendor's `malformed` failure rather than
 * a thrown exception the renderer cannot render. Adding a provider means writing one of these and
 * registering it — no new IPC channels, no preload change, no renderer change.
 *
 * `listEvents` returns canonical CloudAgentEvent payloads. Each adapter translates its vendor's
 * wire format, so the renderer does not need provider-specific transcript branches.
 */
export type CloudAgentAdapter = {
  readonly provider: CloudAgentProviderId
  status: () => Promise<unknown>
  connect: (input: unknown) => Promise<unknown>
  disconnect: () => Promise<void>
  catalog: () => Promise<unknown>
  listSessions: (input: unknown) => Promise<unknown>
  getSession: (input: unknown) => Promise<unknown>
  listEvents: (input: unknown) => Promise<unknown>
  listModels: () => Promise<unknown>
  setSessionModel: (input: unknown) => Promise<unknown>
  createSession: (input: unknown) => Promise<unknown>
  sessionAction: (input: unknown) => Promise<unknown>
  listSchedules: (input: unknown) => Promise<unknown>
  listScheduleRuns: (input: unknown) => Promise<unknown>
  fileLink: (input: unknown) => Promise<unknown>
  streamSubscribe: (input: unknown) => Promise<void>
  streamUnsubscribe: (input: unknown) => Promise<void>
}

/** Every operation is an IPC channel suffix; the list is the channel list. */
export const CLOUD_AGENT_ADAPTER_OPS = [
  'status',
  'connect',
  'disconnect',
  'catalog',
  'listSessions',
  'getSession',
  'listEvents',
  'listModels',
  'setSessionModel',
  'createSession',
  'sessionAction',
  'listSchedules',
  'listScheduleRuns',
  'fileLink',
  'streamSubscribe',
  'streamUnsubscribe'
] as const

export type CloudAgentAdapterOp = (typeof CLOUD_AGENT_ADAPTER_OPS)[number]

const adapters = new Map<string, CloudAgentAdapter>()

export function registerCloudAgentAdapter(adapter: CloudAgentAdapter): void {
  adapters.set(adapter.provider, adapter)
}

export function listCloudAgentAdapters(): CloudAgentAdapter[] {
  return [...adapters.values()]
}

/**
 * Why the nullable-id fallback: a host with one provider configured answers a request that names
 * none, so older call sites and tests keep working without an implicit global default elsewhere.
 */
export function getCloudAgentAdapter(provider: string | null): CloudAgentAdapter | null {
  if (provider) {
    return adapters.get(provider) ?? null
  }
  return adapters.size === 1 ? [...adapters.values()][0] : null
}

/** Test seam: adapters are process-wide, so a suite must be able to start from empty. */
export function resetCloudAgentAdapters(): void {
  adapters.clear()
}
