import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _resetCloudAgentCredentialCaches,
  clearStoredCloudAgentCredential,
  credentialSpecFor,
  getEnvCloudAgentAuthConfig,
  getStoredCloudAgentMetadata,
  hasStoredCloudAgentCredential,
  resolveCloudAgentAuthConfig,
  saveCloudAgentCredential
} from './credentials'
import { OPENHANDS_CLOUD_DEFAULT_API_BASE_URL } from '../../shared/openhands-cloud'

let tempHome = ''
const originalHome = process.env.HOME
const originalOpenHandsKey = process.env.ORCA_OPENHANDS_API_KEY
const originalOpenHandsBase = process.env.ORCA_OPENHANDS_BASE_URL

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-cloud-agent-credentials-'))
  process.env.HOME = tempHome
  delete process.env.ORCA_OPENHANDS_API_KEY
  delete process.env.ORCA_OPENHANDS_BASE_URL
  _resetCloudAgentCredentialCaches()
})

afterEach(() => {
  _resetCloudAgentCredentialCaches()
  rmSync(tempHome, { recursive: true, force: true })
  process.env.HOME = originalHome
  restoreEnv('ORCA_OPENHANDS_API_KEY', originalOpenHandsKey)
  restoreEnv('ORCA_OPENHANDS_BASE_URL', originalOpenHandsBase)
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('cloud agent credentials', () => {
  it('keeps one file pair per provider so a second vendor cannot overwrite the first', () => {
    saveCloudAgentCredential('qoder-cloud', {
      accessToken: 'qoder-token',
      baseUrl: 'https://api.qoder.com/api/v1/cloud'
    })
    saveCloudAgentCredential('openhands-cloud', {
      accessToken: 'openhands-token',
      baseUrl: 'http://127.0.0.1:8971'
    })

    expect(getStoredCloudAgentMetadata('qoder-cloud')?.baseUrl).toBe(
      'https://api.qoder.com/api/v1/cloud'
    )
    expect(getStoredCloudAgentMetadata('openhands-cloud')?.baseUrl).toBe('http://127.0.0.1:8971')
    expect(existsSync(join(tempHome, '.orca', 'qoder-cloud-credential.json'))).toBe(true)
    expect(existsSync(join(tempHome, '.orca', 'openhands-cloud-credential.json'))).toBe(true)

    clearStoredCloudAgentCredential('openhands-cloud')
    expect(hasStoredCloudAgentCredential('openhands-cloud')).toBe(false)
    expect(hasStoredCloudAgentCredential('qoder-cloud')).toBe(true)
  })

  it('reads each provider from its own env vars only', () => {
    process.env.ORCA_OPENHANDS_API_KEY = 'from-env'
    process.env.ORCA_OPENHANDS_BASE_URL = 'http://127.0.0.1:9999'

    expect(getEnvCloudAgentAuthConfig('openhands-cloud')).toEqual({
      accessToken: 'from-env',
      baseUrl: 'http://127.0.0.1:9999'
    })
    expect(getEnvCloudAgentAuthConfig('qoder-cloud')).toBeNull()
    // Env wins over a saved credential, so a relay host never needs the keychain.
    expect(resolveCloudAgentAuthConfig('openhands-cloud')?.accessToken).toBe('from-env')
  })

  it('falls back to the descriptor default base URL when only a key is given', () => {
    process.env.ORCA_OPENHANDS_API_KEY = 'from-env'
    expect(getEnvCloudAgentAuthConfig('openhands-cloud')?.baseUrl).toBe(
      OPENHANDS_CLOUD_DEFAULT_API_BASE_URL
    )
  })

  it('refuses to save against an unknown provider', () => {
    expect(credentialSpecFor('nope-cloud')).toBeNull()
    expect(() =>
      saveCloudAgentCredential('nope-cloud', { accessToken: 'x', baseUrl: 'https://example.com' })
    ).toThrow(/Unknown cloud agent provider/)
  })
})
