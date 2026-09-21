import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { getMe, selectOrg, type Me, type Org, type Role, type User, type Membership } from '../api/auth'
import { setOrgRequiredHandler } from '../api/client'

interface AuthContextValue {
  user: User | null
  org: Org | null
  memberships: Membership[]
  role: Role | null
  loading: boolean
  setMe: (me: Me | null) => void
  setOrg: (orgId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setOrgRequiredHandler(() => {
      setMe((prev) => (prev ? { ...prev, org: null, role: null } : prev))
      navigate('/select-org')
    })
    return () => setOrgRequiredHandler(null)
  }, [navigate])

  async function setOrg(orgId: string) {
    const next = await selectOrg(orgId)
    setMe(next)
  }

  return (
    <AuthContext.Provider
      value={{
        user: me?.user ?? null,
        org: me?.org ?? null,
        memberships: me?.memberships ?? [],
        role: me?.role ?? null,
        loading,
        setMe,
        setOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
