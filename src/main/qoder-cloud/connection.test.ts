import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AuthConfig = { baseUrl: string; accessToken: string }

const credentialStore = {
  getEnvQoderCloudAuthConfig: vi.fn<() => AuthConfig | null>(() => null),
  getStoredQoderCloudMetadata: vi.fn<() => { baseUrl: string } | null>(() => null),
  hasStoredQoderCloudCredential: vi.fn(() => false),
  getStoredQoderCloudCredentialError: vi.fn(() => null),
  loadStoredQoderCloudToken: vi.fn<() => string | null>(() => null),
  saveQoderCloudCredential: vi.fn(),
  clearStoredQoderCloudCredential: vi.fn()
}

vi.mock('./credential-store', () => credentialStore)

function authorizationHeader(callIndex: number): string | undefined {
  const init = fetchMock.mock.calls[callIndex]?.[1]
  const headers = init?.headers
  return headers instanceof Headers
    ? (headers.get('Authorization') ?? undefined)
    : Array.isArray(headers) || headers === undefined
      ? undefined
      : headers.Authorization
}

function requestUrl(callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex]?.[0])
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  for (const mock of Object.values(credentialStore)) {
    mock.mockClear()
  }
  credentialStore.getEnvQoderCloudAuthConfig.mockReturnValue(null)
  credentialStore.getStoredQoderCloudMetadata.mockReturnValue(null)
  credentialStore.loadStoredQoderCloudToken.mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connectQoderCloud', () => {
  it('verifies against /agents and persists only on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], has_more: false }))
    const { connectQoderCloud } = await import('./connection')

    await expect(connectQoderCloud({ accessToken: ' pat ' })).resolves.toEqual({ ok: true })

    expect(requestUrl(0)).toBe('https://api.qoder.com/api/v1/cloud/agents?limit=1')
    expect(authorizationHeader(0)).toBe('Bearer pat')
    expect(credentialStore.saveQoderCloudCredential).toHaveBeenCalledWith({
      baseUrl: 'https://api.qoder.com/api/v1/cloud',
      accessToken: 'pat'
    })
  })

  it('tells a rejected token apart from an unreachable API', async () => {
    const { connectQoderCloud } = await import('./connection')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'bad' } })
    )
    const rejected = await connectQoderCloud({ accessToken: 'x' })
    expect(rejected.ok).toBe(false)
    expect(rejected.ok ? '' : rejected.error).toMatch(/rejected/i)

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const unreachable = await connectQoderCloud({ accessToken: 'x' })
    expect(unreachable.ok ? '' : unreachable.error).toMatch(/could not reach/i)

    expect(credentialStore.saveQoderCloudCredential).not.toHaveBeenCalled()
  })

  it('refuses a non-https base URL before sending the token anywhere', async () => {
    const { connectQoderCloud } = await import('./connection')
    const result = await connectQoderCloud({ accessToken: 'x', baseUrl: 'http://evil.example' })
    expect(result).toEqual({ ok: false, error: 'The API base URL must be an https:// URL.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires a token', async () => {
    const { connectQoderCloud } = await import('./connection')
    expect(await connectQoderCloud({ accessToken: '  ' })).toEqual({
      ok: false,
      error: 'Enter a Qoder access token.'
    })
  })
})

describe('listSessions', () => {
  it('reports not-configured without touching the network', async () => {
    const { listSessions } = await import('./connection')
    const result = await listSessions({})
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toBe('not-configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefers the env credential and forwards filters as query params', async () => {
    credentialStore.getEnvQoderCloudAuthConfig.mockReturnValue({
      baseUrl: 'https://api.qoder.com.cn/api/v1/cloud/',
      accessToken: 'env-token'
    })
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], next_page: null }))
    const { listSessions } = await import('./connection')

    const result = await listSessions({ limit: 500, statuses: ['running', 'idle'], page: 'c2' })

    expect(result).toEqual({ ok: true, page: { sessions: [], nextPage: null } })
    const url = new URL(requestUrl(0))
    expect(url.origin + url.pathname).toBe('https://api.qoder.com.cn/api/v1/cloud/sessions')
    // Why: the API returns 400 above 100, so the client clamps rather than failing.
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.getAll('statuses')).toEqual(['running', 'idle'])
    expect(url.searchParams.get('page')).toBe('c2')
    expect(credentialStore.loadStoredQoderCloudToken).not.toHaveBeenCalled()
  })

  it('falls back to the stored credential when no env token is set', async () => {
    credentialStore.getStoredQoderCloudMetadata.mockReturnValue({
      baseUrl: 'https://api.qoder.com/api/v1/cloud'
    })
    credentialStore.loadStoredQoderCloudToken.mockReturnValue('stored-token')
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], next_page: null }))
    const { listSessions } = await import('./connection')

    await listSessions({})

    expect(credentialStore.loadStoredQoderCloudToken).toHaveBeenCalledWith({ force: true })
    expect(authorizationHeader(0)).toBe('Bearer stored-token')
  })
})
