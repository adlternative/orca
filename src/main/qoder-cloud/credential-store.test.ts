import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome = ''

async function loadStore(options: { encryptionAvailable?: boolean } = {}) {
  vi.resetModules()
  const { setSecretStore } = await import('../../shared/secret-store')
  setSecretStore({
    isEncryptionAvailable: () => options.encryptionAvailable ?? true,
    // Reversible stand-in so the test can prove the file is not the plaintext token.
    encryptString: (value) => Buffer.from(`sealed:${value}`),
    decryptString: (cipher) => cipher.toString('utf-8').replace(/^sealed:/, ''),
    describeProtectionGap: () => null
  })
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof Os>('node:os')
    return { ...actual, homedir: () => tempHome }
  })
  return import('./credential-store')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-qoder-cloud-store-'))
  delete process.env.ORCA_QODER_ACCESS_TOKEN
  delete process.env.QODER_ACCESS_TOKEN
  delete process.env.ORCA_QODER_API_BASE_URL
})

describe('Qoder Cloud credential store', () => {
  it('stores the token sealed and the base URL in plaintext metadata', async () => {
    const store = await loadStore()
    store.saveQoderCloudCredential({
      baseUrl: 'https://api.qoder.com.cn/api/v1/cloud',
      accessToken: 'pat_secret'
    })

    expect(store.hasStoredQoderCloudCredential()).toBe(true)
    expect(store.getStoredQoderCloudMetadata()?.baseUrl).toBe(
      'https://api.qoder.com.cn/api/v1/cloud'
    )
    const sealed = readFileSync(join(tempHome, '.orca', 'qoder-cloud-credential.enc'))
    expect(sealed.toString('utf-8')).toBe('sealed:pat_secret')
    const metadata = readFileSync(join(tempHome, '.orca', 'qoder-cloud-credential.json'), 'utf-8')
    expect(metadata).not.toContain('pat_secret')
  })

  it('does not decrypt on status reads; only a forced load touches the secret', async () => {
    const store = await loadStore()
    store.saveQoderCloudCredential({
      baseUrl: 'https://api.qoder.com/api/v1/cloud',
      accessToken: 'tok'
    })
    store._resetQoderCloudCredentialCache()

    expect(store.hasStoredQoderCloudCredential()).toBe(true)
    expect(store.loadStoredQoderCloudToken()).toBeNull()
    expect(store.loadStoredQoderCloudToken({ force: true })).toBe('tok')
  })

  it('clear removes both files and the in-memory copy', async () => {
    const store = await loadStore()
    store.saveQoderCloudCredential({
      baseUrl: 'https://api.qoder.com/api/v1/cloud',
      accessToken: 'tok'
    })
    store.clearStoredQoderCloudCredential()

    expect(store.hasStoredQoderCloudCredential()).toBe(false)
    expect(store.loadStoredQoderCloudToken({ force: true })).toBeNull()
    expect(existsSync(join(tempHome, '.orca', 'qoder-cloud-credential.enc'))).toBe(false)
    expect(existsSync(join(tempHome, '.orca', 'qoder-cloud-credential.json'))).toBe(false)
  })

  it('reads env configuration with the Orca-prefixed variable winning', async () => {
    const store = await loadStore()
    expect(store.getEnvQoderCloudAuthConfig()).toBeNull()
    process.env.QODER_ACCESS_TOKEN = 'plain'
    expect(store.getEnvQoderCloudAuthConfig()?.accessToken).toBe('plain')
    process.env.ORCA_QODER_ACCESS_TOKEN = 'orca'
    process.env.ORCA_QODER_API_BASE_URL = 'https://api.qoder.com.cn/api/v1/cloud'
    expect(store.getEnvQoderCloudAuthConfig()).toEqual({
      accessToken: 'orca',
      baseUrl: 'https://api.qoder.com.cn/api/v1/cloud'
    })
  })
})
