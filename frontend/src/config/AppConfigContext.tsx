import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getConfig, type AppConfig } from '../api/config'

interface AppConfigContextValue {
  config: AppConfig
  loading: boolean
}

const NOT_DEMO: AppConfig = { demoMode: false }

const AppConfigContext = createContext<AppConfigContextValue | null>(null)

// Mirrors AuthProvider: one fetch on boot, a loading flag so /login can wait
// to learn which sign-in panel to show. Fails open to { demoMode: false } -
// a 404 (older backend), a 500, or an offline boot must all leave a real
// deployment behaving exactly as it does without this provider.
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(NOT_DEMO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getConfig()
      .then((data) => setConfig({ ...NOT_DEMO, ...data }))
      .catch(() => setConfig(NOT_DEMO))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppConfigContext.Provider value={{ config, loading }}>{children}</AppConfigContext.Provider>
  )
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext)
  if (!ctx) throw new Error('useAppConfig must be used within an AppConfigProvider')
  return ctx
}
