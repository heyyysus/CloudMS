import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import {
  createCorrespondenceTemplate,
  deleteCorrespondenceTemplate,
  getCorrespondenceTemplates,
  updateCorrespondenceTemplate,
  type CorrespondenceTemplate,
} from '@/api/correspondenceTemplates'
import { AddCorrespondenceTemplateDialog } from '@/components/admin/add-correspondence-template-dialog'
import { DeleteCorrespondenceTemplateDialog } from '@/components/admin/delete-correspondence-template-dialog'
import { EditCorrespondenceTemplateDialog } from '@/components/admin/edit-correspondence-template-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/date-display'

interface ManageCorrespondenceTemplatesCardProps {
  previewAgent?: { name: string | null; email: string }
  getCorrespondenceTemplatesFn?: typeof getCorrespondenceTemplates
  createCorrespondenceTemplateFn?: typeof createCorrespondenceTemplate
  updateCorrespondenceTemplateFn?: typeof updateCorrespondenceTemplate
  deleteCorrespondenceTemplateFn?: typeof deleteCorrespondenceTemplate
}

export function ManageCorrespondenceTemplatesCard({
  previewAgent,
  getCorrespondenceTemplatesFn = getCorrespondenceTemplates,
  createCorrespondenceTemplateFn = createCorrespondenceTemplate,
  updateCorrespondenceTemplateFn = updateCorrespondenceTemplate,
  deleteCorrespondenceTemplateFn = deleteCorrespondenceTemplate,
}: ManageCorrespondenceTemplatesCardProps) {
  const [editing, setEditing] = useState<CorrespondenceTemplate | null>(null)
  const [deleting, setDeleting] = useState<CorrespondenceTemplate | null>(null)

  const { data, isPending, isError } = useQuery({
    queryKey: ['correspondenceTemplates'],
    queryFn: ({ signal }) => getCorrespondenceTemplatesFn(signal),
  })

  const mergeFields = data?.mergeFields ?? []
  const templates = data?.templates ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correspondence templates</CardTitle>
        <CardAction>
          <AddCorrespondenceTemplateDialog
            mergeFields={mergeFields}
            previewAgent={previewAgent}
            createCorrespondenceTemplateFn={createCorrespondenceTemplateFn}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load templates.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!isPending && !isError && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        )}
        {!isPending &&
          !isError &&
          templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium">{template.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {template.subject}
                  {formatDate(template.updatedAt) ? ` · Updated ${formatDate(template.updatedAt)}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${template.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setEditing(template)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(template)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
      </CardContent>

      <EditCorrespondenceTemplateDialog
        template={editing}
        mergeFields={mergeFields}
        previewAgent={previewAgent}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        updateCorrespondenceTemplateFn={updateCorrespondenceTemplateFn}
      />
      <DeleteCorrespondenceTemplateDialog
        template={deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        deleteCorrespondenceTemplateFn={deleteCorrespondenceTemplateFn}
      />
    </Card>
  )
}
