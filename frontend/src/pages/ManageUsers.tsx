import { useAuth } from '@/auth/AuthContext'
import { ManageUsersCard } from '@/components/admin/user-list'

function ManageUsers() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Users</h1>
        <p className="text-muted-foreground">
          Change roles, disable accounts, and resend welcome emails.
        </p>
      </div>
      <ManageUsersCard currentUserId={user?.id} />
    </div>
  )
}

export default ManageUsers
