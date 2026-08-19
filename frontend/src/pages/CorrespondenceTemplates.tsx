import { useAuth } from '@/auth/AuthContext'
import { ManageCorrespondenceTemplatesCard } from '@/components/admin/correspondence-template-list'

function CorrespondenceTemplates() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correspondence Templates</h1>
        <p className="text-muted-foreground">
          Create and preview reusable client email templates with merge fields for the client,
          their policy, and you.
        </p>
      </div>
      <ManageCorrespondenceTemplatesCard
        previewAgent={user ? { name: user.name, email: user.email } : undefined}
      />
    </div>
  )
}

export default CorrespondenceTemplates
