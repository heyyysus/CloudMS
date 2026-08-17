import { InviteUserCard } from '@/components/admin/invite-user-form'
import { WelcomeTemplateEditor } from '@/components/admin/welcome-template-editor'

// Role gating lives on the route (RequireRole in App.tsx), which covers this
// page and every other one under /admin.
function Admin() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invite User</h1>
        <p className="text-muted-foreground">
          Invite someone to CloudMS and manage the welcome email they receive.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <InviteUserCard />
        <WelcomeTemplateEditor />
      </div>
    </div>
  )
}

export default Admin
