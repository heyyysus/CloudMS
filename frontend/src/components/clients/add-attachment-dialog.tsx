import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { splitFileName } from '@/lib/file-display'
import { formatFileSize } from '@/lib/format-file-size'
import {
  confirmPolicyAttachmentUpload,
  presignPolicyAttachmentUpload,
  type PolicyAttachment,
} from '@/api/policyAttachments'
import { useToast } from '@/components/ui/toast'

// Mirrors the server defaults (POLICY_ATTACHMENT_MAX_SIZE_MB /
// ATTACHMENT_MIME_TYPES) for immediate feedback - the server is the source
// of truth and re-validates independently.
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

const attachmentFormSchema = z.object({
  file: z
    .instanceof(File, { message: 'Choose a file' })
    .refine((file) => ALLOWED_TYPES.includes(file.type), 'Only PDF, PNG, or JPEG files are allowed')
    .refine((file) => file.size <= MAX_SIZE_BYTES, 'File exceeds the 10MB limit'),
  name: z.string().trim().min(1, 'Enter a file name').max(200, 'Max 200 characters'),
  description: z.string().trim().max(2000, 'Max 2000 characters').optional(),
})

type AttachmentFormValues = z.infer<typeof attachmentFormSchema>

export interface AttachmentSubmitValues {
  file: File
  name: string
  description?: string
}

interface AddAttachmentFormProps {
  initialFile?: File
  onSubmit: (values: AttachmentSubmitValues) => void
  onCancel?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function AddAttachmentForm({
  initialFile,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: AddAttachmentFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AttachmentFormValues>({
    resolver: zodResolver(attachmentFormSchema),
    defaultValues: {
      file: initialFile,
      name: initialFile ? splitFileName(initialFile.name).base : '',
      description: '',
    },
  })

  const submit = handleSubmit((values) => onSubmit(values))

  const file = watch('file')

  return (
    <form onSubmit={submit} noValidate>
      <Field data-invalid={!!errors.file}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          className="sr-only"
          aria-label="Attachment file"
          onChange={(e) => {
            const selected = e.target.files?.[0]
            if (selected) {
              setValue('file', selected, { shouldValidate: true, shouldDirty: true })
              setValue('name', splitFileName(selected.name).base, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Choose file
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {file ? `${file.name} (${formatFileSize(file.size)})` : 'No file selected'}
          </span>
        </div>
        <FieldError errors={errors.file ? [errors.file] : undefined} />
      </Field>

      <Field data-invalid={!!errors.name} className="mt-4">
        <FieldLabel htmlFor="attachment-form-name">Name</FieldLabel>
        <Input id="attachment-form-name" {...register('name')} />
        <FieldError errors={errors.name ? [errors.name] : undefined} />
      </Field>

      <Field data-invalid={!!errors.description} className="mt-4">
        <Textarea
          id="attachment-form-description"
          rows={3}
          placeholder="Description (optional)"
          {...register('description')}
        />
        <FieldError errors={errors.description ? [errors.description] : undefined} />
      </Field>

      {errorMessage && (
        <div role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton isPending={isPending} pendingLabel="Uploading…">
          Upload
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

interface AddAttachmentDialogProps {
  policyId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFile?: File
  presignFn?: typeof presignPolicyAttachmentUpload
  confirmFn?: typeof confirmPolicyAttachmentUpload
}

// Controlled by the parent (ClientDetail): opened either by the "Add
// attachment" button on a PolicyAttachments section or by dropping a file
// onto the page, both targeting whichever policy is currently selected.
export function AddAttachmentDialog({
  policyId,
  open,
  onOpenChange,
  initialFile,
  presignFn = presignPolicyAttachmentUpload,
  confirmFn = confirmPolicyAttachmentUpload,
}: AddAttachmentDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: async ({ file, name, description }: AttachmentSubmitValues) => {
      // The user edits only the base name; the original extension is
      // re-appended so the stored file name still reflects the real type.
      const fileName = `${name.trim()}${splitFileName(file.name).ext}`

      const { uploadUrl, storageKey } = await presignFn({
        policyId,
        fileName,
        contentType: file.type,
        sizeBytes: file.size,
      })

      // Direct-to-R2 PUT: plain fetch, not the api/client.ts request() helper
      // - this is a different origin and must not send the session cookie.
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error('Upload to storage failed')
      }

      return confirmFn({
        policyId,
        storageKey,
        fileName,
        description: description || null,
      })
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PolicyAttachment[]>(['policyAttachments', policyId], (old) => [
        data,
        ...(old ?? []),
      ])
      onOpenChange(false)
      toast.success('New attachment uploaded')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add attachment</DialogTitle>
          <DialogDescription>
            Upload a PDF, PNG, or JPEG file to this policy (max 10MB).
          </DialogDescription>
        </DialogHeader>
        <AddAttachmentForm
          initialFile={initialFile}
          onSubmit={(values) => mutation.mutate(values)}
          onCancel={() => onOpenChange(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
