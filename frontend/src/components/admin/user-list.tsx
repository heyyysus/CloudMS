import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { getUsers, resendWelcome, updateUser, type AdminUser, type UpdateUserBody } from '@/api/users'
import { EditUserDialog } from '@/components/admin/edit-user-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface ManageUsersCardProps {
  // The signed-in admin's id, so their own row can be marked and its
  // self-guarded actions hidden. Passed in rather than read from AuthContext
  // so this renders standalone in Storybook.
  currentUserId?: number
  getUsersFn?: typeof getUsers
  updateUserFn?: typeof updateUser
  resendWelcomeFn?: typeof resendWelcome
}

export function ManageUsersCard({
  currentUserId,
  getUsersFn = getUsers,
  updateUserFn = updateUser,
  resendWelcomeFn = resendWelcome,
}: ManageUsersCardProps) {
  const selfId = currentUserId
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const {
    data: users,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => getUsersFn(signal),
  })

  // One mutation drives both the dialog and the per-row quick actions; the
  // list is small enough that a refetch is cheaper than reconciling by hand.
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateUserBody }) => updateUserFn(id, body),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditing(null)
      toast.success(`Saved changes to ${user.name ?? user.email}`)
    },
    onError: (error) => toast.error(error.message),
  })

  const resend = useMutation({
    mutationFn: (id: number) => resendWelcomeFn(id),
    onSuccess: (result) => {
      if (result.email.status === 'sent') toast.success('Welcome email sent')
      else toast.error(`Welcome email failed${result.email.error ? `: ${result.email.error}` : ''}`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load users.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!isPending && !isError && users?.length === 0 && (
          <p className="text-sm text-muted-foreground">No users.</p>
        )}
        {!isPending &&
          !isError &&
          users?.map((user) => {
            const isSelf = user.id === selfId
            return (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <span
                    className={cn(
                      'block truncate font-medium',
                      !user.isActive && 'text-muted-foreground line-through'
                    )}
                  >
                    {user.name ?? user.email}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
                  <span
                    className={cn(
                      'text-xs',
                      user.isActive ? 'text-muted-foreground' : 'text-destructive'
                    )}
                  >
                    {user.isActive ? (user.hasSignedIn ? 'Active' : 'Invited') : 'Disabled'}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${user.name ?? user.email}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => setEditing(user)}>Edit</DropdownMenuItem>
                      {/* The server rejects a self role change or self-disable
                          outright, so those two are simply not offered here. */}
                      <DropdownMenuItem
                        disabled={isSelf || update.isPending}
                        onSelect={() =>
                          update.mutate({
                            id: user.id,
                            body: { role: user.role === 'admin' ? 'staff' : 'admin' },
                          })
                        }
                      >
                        {user.role === 'admin' ? 'Make staff' : 'Make admin'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isSelf || update.isPending}
                        onSelect={() =>
                          update.mutate({ id: user.id, body: { isActive: !user.isActive } })
                        }
                      >
                        {user.isActive ? 'Disable account' : 'Enable account'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={resend.isPending}
                        onSelect={() => resend.mutate(user.id)}
                      >
                        Resend welcome email
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
      </CardContent>

      <EditUserDialog
        user={editing}
        isSelf={editing?.id === selfId}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null)
            update.reset()
          }
        }}
        onSubmit={(body) => editing && update.mutate({ id: editing.id, body })}
        isPending={update.isPending}
        errorMessage={update.isError ? update.error.message : null}
      />
    </Card>
  )
}
