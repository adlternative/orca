import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CredentialDecryptionError,
  credentialFileHasContent,
  readStoredCredentialToken,
  writeCredentialFileAtomic,
  writeEncryptedCredential
} from '../integration-credential-file'
import type { IntegrationCredentialService } from '../../shared/integration-credential-errors'
import { CLAUDE_MANAGED_DEFAULT_API_BASE_URL } from '../../shared/claude-managed'
import { OPENHANDS_CLOUD_DEFAULT_API_BASE_URL } from '../../shared/openhands-cloud'
import { QODER_CLOUD_DEFAULT_API_BASE_URL } from '../../shared/qoder-cloud-types'

/**
 * One credential per provider, keyed by provider id.
 *
 * Why per provider: the settings pane renders a card per vendor, so a single file/secret pair would
 * make the second card overwrite the first. The split — encrypted token in `.enc`, plaintext
 * metadata in `.json` — is what lets status reads avoid an OS keychain prompt.
 */
export type CloudAgentStoredCredentialMetadata = {
  version: 1
  baseUrl: string
  updatedAt: string
}

export type CloudAgentAuthConfig = {
  baseUrl: string
  accessToken: string
}

export type CloudAgentCredentialSpec = {
  /** File stem under ~/.orca; the `.json` and `.enc` suffixes are added. */
  file: string
  /** Label shown by the OS keychain entry. */
  keychainLabel: IntegrationCredentialService
  defaultBaseUrl: string
  /** Environment variables that override whatever is stored, most specific first. */
  envTokenVars: string[]
  /** Read the vendor's own CLI login as a last resort, so an authenticated `ant` needs no copy. */
  vendorCliCredentialFile?: string
  envBaseUrlVars: string[]
}

const SPECS: Record<string, CloudAgentCredentialSpec> = {
  'qoder-cloud': {
    file: 'qoder-cloud-credential',
    keychainLabel: 'Qoder',
    defaultBaseUrl: QODER_CLOUD_DEFAULT_API_BASE_URL,
    envTokenVars: ['ORCA_QODER_ACCESS_TOKEN', 'QODER_ACCESS_TOKEN'],
    envBaseUrlVars: ['ORCA_QODER_API_BASE_URL']
  },
  'claude-managed': {
    file: 'claude-managed-credential',
    keychainLabel: 'Anthropic',
    defaultBaseUrl: CLAUDE_MANAGED_DEFAULT_API_BASE_URL,
    // `ANTHROPIC_API_KEY` is deliberately absent: Orca itself uses that name, and a cloud agent
    // inheriting the host's own key would be a surprise, not a feature.
    envTokenVars: ['ORCA_CLAUDE_MANAGED_API_KEY'],
    vendorCliCredentialFile: '.config/anthropic/credentials/default.json',
    envBaseUrlVars: ['ORCA_CLAUDE_MANAGED_BASE_URL']
  },
  'openhands-cloud': {
    file: 'openhands-cloud-credential',
    keychainLabel: 'OpenHands',
    defaultBaseUrl: OPENHANDS_CLOUD_DEFAULT_API_BASE_URL,
    envTokenVars: ['ORCA_OPENHANDS_API_KEY'],
    envBaseUrlVars: ['ORCA_OPENHANDS_BASE_URL']
  }
}

type Cache = {
  metadata: CloudAgentStoredCredentialMetadata | null
  metadataLoadedFromDisk: boolean
  token: string | null
  error: string | null
}

const caches = new Map<string, Cache>()

function cacheFor(provider: string): Cache {
  const existing = caches.get(provider)
  if (existing) {
    return existing
  }
  const created: Cache = {
    metadata: null,
    metadataLoadedFromDisk: false,
    token: null,
    error: null
  }
  caches.set(provider, created)
  return created
}

export function credentialSpecFor(provider: string): CloudAgentCredentialSpec | null {
  return SPECS[provider] ?? null
}

function paths(provider: string): { metadata: string; secret: string } | null {
  const spec = credentialSpecFor(provider)
  if (!spec) {
    return null
  }
  const dir = join(homedir(), '.orca')
  return {
    metadata: join(dir, `${spec.file}.json`),
    secret: join(dir, `${spec.file}.enc`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

/** Env vars win over the stored credential so a CI/relay host needs no keychain. */
/**
 * The vendor CLI's own login, read fresh because its token expires within hours.
 *
 * Why: Anthropic's `ant auth login` already holds a working OAuth token on this machine; asking the
 * user to paste it into a second store would be busywork that goes stale twice a day.
 */
export function getVendorCliAuthConfig(provider: string): CloudAgentAuthConfig | null {
  const spec = credentialSpecFor(provider)
  if (!spec?.vendorCliCredentialFile) {
    return null
  }
  const file = join(homedir(), spec.vendorCliCredentialFile)
  try {
    const record: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (!isRecord(record) || typeof record.access_token !== 'string') {
      return null
    }
    const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : null
    // Why the skew: a token that expires mid-request is worse than asking for a fresh login.
    if (expiresAt !== null && expiresAt * 1000 <= Date.now() + 60_000) {
      return null
    }
    return { baseUrl: spec.defaultBaseUrl, accessToken: record.access_token }
  } catch {
    return null
  }
}

/** Env first, then whatever settings saved. The token is decrypted only when a request needs it. */
export function resolveCloudAgentAuthConfig(provider: string): CloudAgentAuthConfig | null {
  const fromEnv = getEnvCloudAgentAuthConfig(provider)
  if (fromEnv) {
    return fromEnv
  }
  const stored = getStoredCloudAgentMetadata(provider)
  const spec = credentialSpecFor(provider)
  if (!stored || !spec) {
    return getVendorCliAuthConfig(provider)
  }
  // Why caught: `status()` must stay total. A credential the keychain refuses to decrypt is a
  // reportable state (`credentialError`), not an exception that kills every caller of status().
  let token: string | null = null
  try {
    token = loadStoredCloudAgentToken(provider, { force: true })
  } catch {
    token = null
  }
  return token
    ? { baseUrl: stored.baseUrl || spec.defaultBaseUrl, accessToken: token }
    : getVendorCliAuthConfig(provider)
}

export function getEnvCloudAgentAuthConfig(provider: string): CloudAgentAuthConfig | null {
  const spec = credentialSpecFor(provider)
  if (!spec) {
    return null
  }
  const accessToken = spec.envTokenVars.map(envValue).find((value) => value !== null) ?? null
  if (!accessToken) {
    return null
  }
  const baseUrl = spec.envBaseUrlVars.map(envValue).find((value) => value !== null)
  return { baseUrl: baseUrl ?? spec.defaultBaseUrl, accessToken }
}

function readMetadataFromDisk(provider: string): CloudAgentStoredCredentialMetadata | null {
  const target = paths(provider)
  const spec = credentialSpecFor(provider)
  if (!target || !spec || !existsSync(target.metadata)) {
    return null
  }
  try {
    const record: unknown = JSON.parse(readFileSync(target.metadata, 'utf-8'))
    if (!isRecord(record)) {
      return null
    }
    return {
      version: 1,
      baseUrl:
        typeof record.baseUrl === 'string' && record.baseUrl.length > 0
          ? record.baseUrl
          : spec.defaultBaseUrl,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : ''
    }
  } catch {
    return null
  }
}

export function getStoredCloudAgentMetadata(
  provider: string
): CloudAgentStoredCredentialMetadata | null {
  const cache = cacheFor(provider)
  if (!cache.metadataLoadedFromDisk) {
    cache.metadata = readMetadataFromDisk(provider)
    cache.metadataLoadedFromDisk = true
  }
  return cache.metadata
}

/** Cheap "is a credential saved?" check; never decrypts. */
export function hasStoredCloudAgentCredential(provider: string): boolean {
  const target = paths(provider)
  return (
    target !== null &&
    getStoredCloudAgentMetadata(provider) !== null &&
    credentialFileHasContent(target.secret)
  )
}

export function getStoredCloudAgentCredentialError(provider: string): string | null {
  return cacheFor(provider).error
}

/** Cache-first; touches the keychain only with `force`. Throws CredentialDecryptionError. */
export function loadStoredCloudAgentToken(
  provider: string,
  options: { force?: boolean } = {}
): string | null {
  const cache = cacheFor(provider)
  if (cache.token !== null) {
    return cache.token
  }
  if (!options.force) {
    return null
  }
  const target = paths(provider)
  const spec = credentialSpecFor(provider)
  if (!target || !spec || !existsSync(target.secret)) {
    return null
  }
  try {
    const token = readStoredCredentialToken(spec.keychainLabel, readFileSync(target.secret))
    if (!token) {
      return null
    }
    cache.token = token
    cache.error = null
    return token
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      cache.error = error.message
      throw error
    }
    return null
  }
}

export function saveCloudAgentCredential(provider: string, input: CloudAgentAuthConfig): void {
  const target = paths(provider)
  const spec = credentialSpecFor(provider)
  if (!target || !spec) {
    throw new Error(`Unknown cloud agent provider: ${provider}`)
  }
  const dir = join(homedir(), '.orca')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeEncryptedCredential(spec.keychainLabel, target.secret, input.accessToken)
  const metadata: CloudAgentStoredCredentialMetadata = {
    version: 1,
    baseUrl: input.baseUrl,
    updatedAt: new Date().toISOString()
  }
  writeCredentialFileAtomic(
    target.metadata,
    Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8')
  )
  const cache = cacheFor(provider)
  cache.metadata = metadata
  cache.metadataLoadedFromDisk = true
  cache.token = input.accessToken
  cache.error = null
}

// Why: a swallowed non-ENOENT unlink would clear memory while the files survive,
// so the credential silently returns on the next launch.
export function clearStoredCloudAgentCredential(provider: string): void {
  const target = paths(provider)
  try {
    if (target) {
      for (const path of [target.secret, target.metadata]) {
        try {
          unlinkSync(path)
        } catch (error) {
          if (!isMissingFileError(error)) {
            throw error
          }
        }
      }
    }
  } finally {
    const cache = cacheFor(provider)
    cache.metadata = null
    cache.metadataLoadedFromDisk = true
    cache.token = null
    cache.error = null
  }
}

function isMissingFileError(error: unknown): error is Error & { code: string } {
  return isRecord(error) && error.code === 'ENOENT'
}

/** @internal tests need a clean in-memory cache between cases. */
export function _resetCloudAgentCredentialCaches(): void {
  caches.clear()
}
