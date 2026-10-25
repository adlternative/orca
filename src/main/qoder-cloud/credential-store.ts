import {
  clearStoredCloudAgentCredential,
  getEnvCloudAgentAuthConfig,
  getStoredCloudAgentCredentialError,
  getStoredCloudAgentMetadata,
  hasStoredCloudAgentCredential,
  loadStoredCloudAgentToken,
  saveCloudAgentCredential,
  _resetCloudAgentCredentialCaches,
  type CloudAgentAuthConfig
} from '../cloud-agents/credentials'

/**
 * The Qoder binding of the shared per-provider credential store.
 *
 * Why kept: the Qoder request path and its tests speak these names, and the storage layout must not
 * change for people already signed in. The implementation is provider-keyed.
 */
export const QODER_CLOUD_PROVIDER_KEY = 'qoder-cloud'

export type QoderCloudStoredMetadata = {
  version: 1
  baseUrl: string
  updatedAt: string
}

export type QoderCloudAuthConfig = CloudAgentAuthConfig

export function getEnvQoderCloudAuthConfig(): QoderCloudAuthConfig | null {
  return getEnvCloudAgentAuthConfig(QODER_CLOUD_PROVIDER_KEY)
}

export function getStoredQoderCloudMetadata(): QoderCloudStoredMetadata | null {
  return getStoredCloudAgentMetadata(QODER_CLOUD_PROVIDER_KEY)
}

export function hasStoredQoderCloudCredential(): boolean {
  return hasStoredCloudAgentCredential(QODER_CLOUD_PROVIDER_KEY)
}

export function getStoredQoderCloudCredentialError(): string | null {
  return getStoredCloudAgentCredentialError(QODER_CLOUD_PROVIDER_KEY)
}

export function loadStoredQoderCloudToken(options: { force?: boolean } = {}): string | null {
  return loadStoredCloudAgentToken(QODER_CLOUD_PROVIDER_KEY, options)
}

export function saveQoderCloudCredential(input: QoderCloudAuthConfig): void {
  saveCloudAgentCredential(QODER_CLOUD_PROVIDER_KEY, input)
}

export function clearStoredQoderCloudCredential(): void {
  clearStoredCloudAgentCredential(QODER_CLOUD_PROVIDER_KEY)
}

/** @internal tests need a clean in-memory cache between cases; files are left alone. */
export function _resetQoderCloudCredentialCache(): void {
  _resetCloudAgentCredentialCaches()
}
