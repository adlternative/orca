import type {
  CloudAgentFileLink,
  CloudAgentFileLinkResult
} from '../../shared/cloud-agent-provider'
import { isRecord, optionalNumber, optionalString, requestJson } from './client'
import type { QoderCloudAuthConfig } from './credential-store'

/** Re-resolve this long before the vendor's one-hour expiry so an <img> never races it. */
const FILE_LINK_REFRESH_MARGIN_MS = 5 * 60_000
const fileLinkCache = new Map<string, CloudAgentFileLink>()

/**
 * Resolve a delivered file to a presigned URL. Two calls: metadata (name, type, size) and
 * `/content`, which returns `{url, expires_at}` rather than bytes. Cached per file id until
 * the margin before expiry; the token never reaches the renderer, only the signed URL does.
 */
export async function resolveQoderCloudFileLink(
  config: QoderCloudAuthConfig,
  fileId: string
): Promise<CloudAgentFileLinkResult> {
  const cached = fileLinkCache.get(fileId)
  if (cached && cached.expiresAt - Date.now() > FILE_LINK_REFRESH_MARGIN_MS) {
    return { ok: true, link: cached }
  }
  const encoded = encodeURIComponent(fileId)
  const [meta, content] = await Promise.all([
    requestJson(config, `/files/${encoded}`),
    requestJson(config, `/files/${encoded}/content`)
  ])
  if (!content.ok) {
    return content
  }
  if (!isRecord(content.body) || typeof content.body.url !== 'string') {
    return { ok: false, reason: 'malformed', message: 'Qoder Cloud returned no file URL.' }
  }
  const expiresAt = Date.parse(optionalString(content.body.expires_at) ?? '')
  const metaBody = meta.ok && isRecord(meta.body) ? meta.body : null
  const link: CloudAgentFileLink = {
    fileId,
    url: content.body.url,
    // Why: a missing/invalid expiry is treated as already stale so every use re-resolves.
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    filename: metaBody ? optionalString(metaBody.filename) : null,
    mimeType: metaBody ? optionalString(metaBody.mime_type) : null,
    sizeBytes: metaBody ? optionalNumber(metaBody.size_bytes) : null
  }
  fileLinkCache.set(fileId, link)
  return { ok: true, link }
}

/** @internal tests */
export function _resetQoderCloudFileLinkCache(): void {
  fileLinkCache.clear()
}
