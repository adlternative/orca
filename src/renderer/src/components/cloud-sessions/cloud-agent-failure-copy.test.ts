import { describe, expect, it } from 'vitest'
import { cloudAgentFailureCopy, cloudAgentFailureIsTransient } from './cloud-agent-failure-copy'

describe('cloudAgentFailureCopy', () => {
  it('never renders the vendor text for a known reason', () => {
    const copy = cloudAgentFailureCopy(
      {
        reason: 'not-found',
        message: "Session 'sess_OOtajtktOcphc7g99oro' was not found."
      },
      'Qoder Cloud Agents'
    )
    expect(copy).not.toContain('was not found')
    expect(copy).toMatch(/no longer exists/i)
  })

  it('does not leak english vendor text for an unknown reason either', () => {
    const copy = cloudAgentFailureCopy(
      {
        reason: 'teapot',
        message: 'I am a teapot.'
      },
      'Qoder Cloud Agents'
    )
    expect(copy).not.toContain('teapot')
    expect(copy.length).toBeGreaterThan(0)
  })

  it('names the fix for a rejected token', () => {
    expect(
      cloudAgentFailureCopy(
        {
          reason: 'rejected',
          message: 'invalid pt-token'
        },
        'Qoder Cloud Agents'
      )
    ).toMatch(/Settings/)
  })
})

describe('cloudAgentFailureIsTransient', () => {
  it('only retries what a retry can fix', () => {
    expect(cloudAgentFailureIsTransient({ reason: 'unreachable', message: '' })).toBe(true)
    expect(cloudAgentFailureIsTransient({ reason: 'not-found', message: '' })).toBe(false)
    expect(cloudAgentFailureIsTransient({ reason: 'rejected', message: '' })).toBe(false)
  })
})
