import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteUser, type AdminUser } from '@/api/users'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface DeleteUserDialogProps {
  user: AdminUser | null
  onOpenChange: (open: boolean) => void
  deleteUserFn?: typeof deleteUser
}

// No AlertDialog primitive exists in the repo, so the confirm step is a plain
// controlled Dialog. Controlled by the list: `user` doubles as open state.
export function DeleteUserDialog({
  user,
  onOpenChange,
  deleteUserFn = deleteUser,
}: DeleteUserDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (id: number) => deleteUserFn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
      toast.success(`${user?.name ?? user?.email} deleted`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            Delete “{user?.name ?? user?.email}”? They will be signed out immediately and can no
            longer sign in. This can’t be undone from here.
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <div role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => user && mutation.mutate(user.id)}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
