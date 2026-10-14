const TOKEN_KEY = 'pos.token'

export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Options = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown
  headers?: Record<string, string>
}

export async function api<T = unknown>(
  path: string,
  { body, headers, ...init }: Options = {},
): Promise<T> {
  const token = session.get()
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => undefined)

  if (!res.ok) {
    // A rejected token means the session is over; a full reload resets state.
    if (res.status === 401 && token) {
      session.clear()
      location.href = '/login'
    }
    // Nest validation errors send `message` as an array.
    const message = [data?.message ?? res.statusText].flat().join(', ')
    throw new ApiError(res.status, message)
  }
  return data as T
}
