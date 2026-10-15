import { api, ApiError, session } from './api'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

describe('api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('location', { href: '/' })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends JSON to VITE_API_URL with the bearer token', async () => {
    const fetch = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetch)
    session.set('abc')

    const res = await api('/products', { method: 'POST', body: { a: 1 } })

    expect(res).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://api.test/products')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc',
    })
  })

  it('throws ApiError with the status and server message', async () => {
    vi.stubGlobal('fetch', respond(409, { message: 'Out of stock' }))

    const err = await api('/sales').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, message: 'Out of stock' })
  })

  it('ends the session and goes to /login when the token is rejected', async () => {
    vi.stubGlobal('fetch', respond(401, { message: 'Unauthorized' }))
    session.set('expired')

    await expect(api('/auth/me')).rejects.toThrow(ApiError)

    expect(session.get()).toBeNull()
    expect(location.href).toBe('/login')
  })

  it('does not redirect on 401 without a session (bad login)', async () => {
    vi.stubGlobal('fetch', respond(401, { message: 'Invalid credentials' }))

    await expect(api('/auth/login')).rejects.toThrow('Invalid credentials')

    expect(location.href).toBe('/')
  })
})
