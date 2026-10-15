import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'

/** GETs `path` on mount (and whenever it changes); `reload` refetches. */
export function useFetch<T>(path: string) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')

  const reload = useCallback(
    () =>
      api<T>(path).then(setData, (e: Error) => setError(e.message)),
    [path],
  )
  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, reload }
}

/** Runs a mutation and keeps its error message; `conflict` replaces 409s. */
export function useAction(conflict = 'Ya existe o está en uso') {
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409 ? conflict : String((e as Error).message),
      )
      return false
    }
  }

  return { error, run }
}
