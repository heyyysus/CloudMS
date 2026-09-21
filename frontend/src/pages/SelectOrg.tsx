import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthContext'
import { OrgPicker } from '@/components/auth/org-picker'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { saveTabs } from '@/lib/client-tabs-storage'

function SelectOrg() {
  const { user, org, memberships, loading, setOrg } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (org) return <Navigate to="/home" replace />
  // The backend auto-binds a single-membership user at login, so this is
  // defensive - it should only ever be reached with 0 or 2+ memberships.
  if (memberships.length === 1) return <Navigate to="/home" replace />

  async function handleSelect(orgId: string) {
    setPending(true)
    try {
      await setOrg(orgId)
      queryClient.clear()
      saveTabs([])
      navigate('/home')
    } catch {
      toast.error("Couldn't switch organizations. Please try again.")
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Choose an organization</CardTitle>
          <CardDescription>Select which organization to work in.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgPicker memberships={memberships} onSelect={handleSelect} pending={pending} />
        </CardContent>
      </Card>
    </div>
  )
}

export default SelectOrg
