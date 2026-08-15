import { Navigate } from 'react-router'
import { useAuth } from '@/auth/AuthContext'
import { InviteUserCard } from '@/components/admin/invite-user-form'
import { WelcomeTemplateEditor } from '@/components/admin/welcome-template-editor'

function Admin() {
  const { user } = useAuth()

  // Backend enforces this too (every route here is admin-only); this just
  // keeps a staff user from landing on a page with nothing they can use.
  if (user?.role !== 'admin') return <Navigate to="/home" replace />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Invite users and manage the welcome email.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <InviteUserCard />
        <WelcomeTemplateEditor />
      </div>
    </div>
  )
}

export default Admin
