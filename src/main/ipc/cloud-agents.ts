import { ipcMain } from 'electron'
import {
  CLOUD_AGENT_ADAPTER_OPS,
  getCloudAgentAdapter,
  registerCloudAgentAdapter,
  type CloudAgentAdapterOp
} from '../cloud-agents/adapter'
import { claudeManagedAdapter } from '../cloud-agents/claude-managed-adapter'
import { openhandsCloudAdapter } from '../cloud-agents/openhands-adapter'
import { qoderCloudAdapter } from '../cloud-agents/qoder-cloud-adapter'

const MALFORMED = { ok: false, reason: 'malformed', message: 'Unknown cloud agent provider.' }

/**
 * One generic channel per operation, relayed to whichever adapter the caller names.
 *
 * Why a relay and not 18 hand-written handlers: the handlers were identical apart from a call, and
 * every new vendor copied them. Here the vendor's name in the payload picks the adapter.
 */
export function registerCloudAgentHandlers(): void {
  registerCloudAgentAdapter(qoderCloudAdapter)
  // ponytail: a second adapter behind the same 16 channels — no channel, preload or renderer change.
  registerCloudAgentAdapter(openhandsCloudAdapter)
  registerCloudAgentAdapter(claudeManagedAdapter)

  for (const op of CLOUD_AGENT_ADAPTER_OPS) {
    ipcMain.handle(`cloudAgent:${op}`, async (_event, payload: unknown): Promise<unknown> => {
      const { provider, args } = readEnvelope(payload)
      const adapter = getCloudAgentAdapter(provider)
      if (!adapter) {
        return MALFORMED
      }
      const handler: (input: unknown) => Promise<unknown> = adapter[op as CloudAgentAdapterOp]
      return handler.call(adapter, args)
    })
  }
}

/** Why the envelope: the provider rides alongside the payload so adapters keep their old shapes. */
function readEnvelope(payload: unknown): { provider: string | null; args: unknown } {
  if (typeof payload === 'object' && payload !== null && 'provider' in payload) {
    const record = payload as { provider?: unknown; args?: unknown }
    return {
      provider: typeof record.provider === 'string' ? record.provider : null,
      args: record.args
    }
  }
  return { provider: null, args: payload }
}
