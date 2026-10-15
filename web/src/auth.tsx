import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { api, session } from '@/lib/api'
import type { Role } from '@/nav'

export type User = { sub: number; username: string; role: Role }

type Auth = {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => session.get() !== null)

  // Restores the session from a stored token.
  useEffect(() => {
    if (!session.get()) return
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => session.clear())
      .finally(() => setLoading(false))
  }, [])

  const login = async (username: string, password: string) => {
    const { access_token } = await api<{ access_token: string }>(
      '/auth/login',
      { method: 'POST', body: { username, password } },
    )
    session.set(access_token)
    setUser(await api<User>('/auth/me'))
  }

  const logout = () => {
    session.clear()
    setUser(null)
  }

  if (loading) return null
  return <AuthContext value={{ user, login, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const auth = use(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
