import { describe, expect, it } from 'vitest'
import { cloudAgentIpcFailure, isCloudAgentUnsupported } from './cloud-agent-ipc-failure'

describe('cloudAgentIpcFailure', () => {
  it('reads a missing IPC handler as a capability gap, not an error', () => {
    const failure = cloudAgentIpcFailure(
      new Error(
        "Error invoking remote method 'qoderCloud:listEvents': Error: No handler registered for 'qoderCloud:listEvents'"
      )
    )
    expect(failure).toEqual({
      ok: false,
      reason: 'unsupported',
      message: 'This host does not support cloud agent sessions yet.'
    })
    // Why: Electron's internals must never reach the user verbatim.
    expect(failure.message).not.toMatch(/qoderCloud:|No handler/)
    expect(isCloudAgentUnsupported(failure)).toBe(true)
  })

  it('keeps any other throw as an ordinary unreachable failure', () => {
    expect(cloudAgentIpcFailure(new TypeError('fetch failed'))).toEqual({
      ok: false,
      reason: 'unreachable',
      message: 'fetch failed'
    })
    expect(cloudAgentIpcFailure('boom').reason).toBe('unreachable')
    expect(isCloudAgentUnsupported(null)).toBe(false)
  })
})
