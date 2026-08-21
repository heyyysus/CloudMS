import { useEffect, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router'
import { MailIcon, PaperclipIcon, PlusIcon, XIcon } from 'lucide-react'
import type { ClientDetail } from '@/api/clients'
import type { PolicyDetail } from '@/api/policies'
import {
  getPolicyMergeValues,
  sendPolicyCorrespondence,
  type SendCorrespondenceBody,
} from '@/api/correspondence'
import { getCorrespondenceTemplates } from '@/api/correspondenceTemplates'
import { getPolicyAttachments } from '@/api/policyAttachments'
import { formatFileSize } from '@/lib/format-file-size'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SubmitButton } from '@/components/ui/submit-button'
import { useToast } from '@/components/ui/toast'
import { renderPreview } from '@/lib/correspondence-merge-fields'

// Addresses are compared case-insensitively throughout: the server lowercases
// them before deduping to/cc, so the dialog has to agree or it would offer an
// on-file address the server then rejects as a duplicate.
const normalize = (email: string) => email.trim().toLowerCase()

const recipientSchema = z.object({ email: z.email('Enter a valid email address') })

const sendFormSchema = z
  .object({
    templateId: z.string().min(1, 'Choose a template'),
    to: z.array(recipientSchema).min(1, 'Add at least one recipient'),
    cc: z.array(recipientSchema),
  })
  .superRefine((values, ctx) => {
    const toSet = new Set(values.to.map((r) => normalize(r.email)))
    values.cc.forEach((recipient, index) => {
      if (toSet.has(normalize(recipient.email))) {
        ctx.addIssue({
          code: 'custom',
          path: ['cc', index, 'email'],
          message: 'Already in To',
        })
      }
    })
  })

type SendFormValues = z.infer<typeof sendFormSchema>

interface SendCorrespondenceDialogProps {
  client: ClientDetail
  policy: PolicyDetail
  // Only admins can author templates, so only they get the "create one" link
  // in the empty state. Passed down rather than read from useAuth so the
  // component renders in isolation (stories) without an AuthProvider - the
  // same convention InvoiceReceiptDialog uses.
  isAdmin?: boolean
  // Controlled open, used when the dialog is opened from elsewhere (the
  // Attachments card's "Send to client" action) rather than its own trigger
  // button. When both are omitted the dialog manages its own state and renders
  // the default "Send" trigger.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Files to pre-attach. When non-empty the dialog shows an Attachments
  // section listing them (removable) and includes them in the send.
  initialAttachmentIds?: number[]
  // Called after a successful send, so a parent that opened the dialog (the
  // Attachments card) can drop its selection.
  onSent?: () => void
  getTemplatesFn?: typeof getCorrespondenceTemplates
  getMergeValuesFn?: typeof getPolicyMergeValues
  getPolicyAttachmentsFn?: typeof getPolicyAttachments
  sendFn?: typeof sendPolicyCorrespondence
}

// Lets staff and admins send an admin-authored correspondence template to a
// client, scoped to one policy so the message merges that policy's details and
// the send lands in that policy's log. Wording is never editable here - the
// server re-renders the chosen template at send time - so what the sender
// controls is the recipients and which template goes out.
export function SendCorrespondenceDialog({
  client,
  policy,
  isAdmin = false,
  open: controlledOpen,
  onOpenChange,
  initialAttachmentIds,
  onSent,
  getTemplatesFn = getCorrespondenceTemplates,
  getMergeValuesFn = getPolicyMergeValues,
  getPolicyAttachmentsFn = getPolicyAttachments,
  sendFn = sendPolicyCorrespondence,
}: SendCorrespondenceDialogProps) {
  // Controlled when a parent passes `open`; otherwise the dialog owns the
  // state and renders its own trigger button.
  const isControlled = controlledOpen !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const queryClient = useQueryClient()
  const toast = useToast()

  const templatesQuery = useQuery({
    queryKey: ['correspondenceTemplates'],
    queryFn: ({ signal }) => getTemplatesFn(signal),
    enabled: open,
  })

  const mergeQuery = useQuery({
    queryKey: ['policyMergeValues', policy.id],
    queryFn: ({ signal }) => getMergeValuesFn(policy.id, signal),
    enabled: open,
  })

  // The dialog only shows an attachments section when it was opened with files
  // to send (from the Attachments card's "Send to client" action). The plain
  // "Send" button opens it with none, and it behaves exactly as before.
  const hasInitialAttachments = (initialAttachmentIds?.length ?? 0) > 0

  const attachmentsQuery = useQuery({
    queryKey: ['policyAttachments', policy.id],
    queryFn: ({ signal }) => getPolicyAttachmentsFn(policy.id, signal),
    enabled: open && hasInitialAttachments,
  })

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<SendFormValues>({
    resolver: zodResolver(sendFormSchema),
    defaultValues: { templateId: '', to: [], cc: [] },
  })

  const toArray = useFieldArray({ control, name: 'to' })
  const ccArray = useFieldArray({ control, name: 'cc' })

  // Prefill To with the client's first on-file address each time the dialog
  // opens, so the common case (email the client) is one click. Reopening
  // therefore never carries the last attempt's recipients over.
  //
  // Keyed on the address itself rather than the emails array: that array is a
  // fresh reference on every refetch of the client query, and re-running this
  // would wipe recipients the user had already picked.
  const firstOnFileEmail = client.emails[0]?.email
  useEffect(() => {
    if (!open) return
    reset({ templateId: '', to: firstOnFileEmail ? [{ email: firstOnFileEmail }] : [], cc: [] })
  }, [open, firstOnFileEmail, reset])

  // Attachments live in local state (not the form) so removing one is a plain
  // filter. Seeded from the ids that opened the dialog, and reseeded each open
  // so a reopen never carries a prior selection. Keyed on the serialized ids,
  // not the array reference, so a parent re-render with the same files doesn't
  // wipe removals the user just made.
  const initialAttachmentKey = (initialAttachmentIds ?? []).join(',')
  const [attachmentIds, setAttachmentIds] = useState<number[]>(initialAttachmentIds ?? [])
  useEffect(() => {
    if (!open) return
    setAttachmentIds(initialAttachmentIds ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAttachmentKey])

  const watchedTemplateId = watch('templateId')
  const watchedTo = watch('to')
  const watchedCc = watch('cc')

  const templates = templatesQuery.data?.templates ?? []
  const selectedTemplate = templates.find((t) => String(t.id) === watchedTemplateId)

  // An on-file address already sitting in either field shouldn't be offered
  // again - the server rejects a to/cc overlap, and a duplicate within one
  // field would deliver twice.
  const usedAddresses = useMemo(
    () => new Set([...watchedTo, ...watchedCc].map((r) => normalize(r.email))),
    [watchedTo, watchedCc]
  )
  const unusedOnFile = client.emails.filter((e) => !usedAddresses.has(normalize(e.email)))

  const mergeValues = mergeQuery.data?.values ?? {}
  const subjectPreview = selectedTemplate ? renderPreview(selectedTemplate.subject, mergeValues) : ''
  const bodyPreview = selectedTemplate ? renderPreview(selectedTemplate.body, mergeValues) : ''

  // The chosen attachments resolved to their metadata, in the order selected.
  const selectedAttachments = attachmentIds.flatMap((id) => {
    const found = attachmentsQuery.data?.find((a) => a.id === id)
    return found ? [found] : []
  })
  const totalAttachmentBytes = selectedAttachments.reduce((sum, a) => sum + a.sizeBytes, 0)
  // Don't let a send fire before we know what the files are - otherwise a
  // removal the user is about to make wouldn't be reflected.
  const attachmentsLoading = hasInitialAttachments && attachmentsQuery.isPending

  const mutation = useMutation({
    mutationFn: (body: SendCorrespondenceBody) => sendFn(policy.id, body),
    onSuccess: (result) => {
      // The send appended a policy log entry server-side (with the sent files
      // linked to it); refetch the logs and their attachment badges so they
      // show up in the Logs subtab without a page reload.
      queryClient.invalidateQueries({ queryKey: ['policyLogs', policy.id] })
      queryClient.invalidateQueries({ queryKey: ['policyLogAttachments', policy.id] })
      setOpen(false)
      onSent?.()
      const count = result.to.length + result.cc.length
      toast.success(`Email sent to ${count} recipient${count === 1 ? '' : 's'}`)
    },
    onError: (error) => toast.error(error.message),
  })

  function removeAttachment(id: number) {
    setAttachmentIds((current) => current.filter((a) => a !== id))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) mutation.reset()
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <MailIcon /> Send
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send correspondence</DialogTitle>
          <DialogDescription>
            Send a saved template to this client, filled in with their details and this policy's.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={handleSubmit((values) =>
            mutation.mutate({
              templateId: Number(values.templateId),
              to: values.to.map((r) => normalize(r.email)),
              cc: values.cc.map((r) => normalize(r.email)),
              // Only sent when files are attached, so a plain send stays a
              // { templateId, to, cc } request exactly as before.
              ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
            })
          )}
        >
          <FieldGroup>
            <RecipientField
              legend="To"
              name="to"
              fields={toArray.fields}
              values={watchedTo.map((r) => r.email)}
              onRemove={toArray.remove}
              onAdd={(email) => toArray.append({ email })}
              onFile={unusedOnFile}
              error={errors.to?.message ?? errors.to?.root?.message}
              fieldErrors={watchedTo.map((_, i) => errors.to?.[i]?.email?.message)}
            />

            <RecipientField
              legend="Cc"
              name="cc"
              fields={ccArray.fields}
              values={watchedCc.map((r) => r.email)}
              onRemove={ccArray.remove}
              onAdd={(email) => ccArray.append({ email })}
              onFile={unusedOnFile}
              error={errors.cc?.message ?? errors.cc?.root?.message}
              fieldErrors={watchedCc.map((_, i) => errors.cc?.[i]?.email?.message)}
            />

            <Field data-invalid={!!errors.templateId}>
              <FieldLabel htmlFor="correspondence-template">Template</FieldLabel>
              {templatesQuery.isPending ? (
                <Skeleton className="h-9 w-full" />
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No correspondence templates yet.{' '}
                  {isAdmin && (
                    <Link to="/admin/correspondence" className="underline">
                      Create one
                    </Link>
                  )}
                </p>
              ) : (
                <Controller
                  control={control}
                  name="templateId"
                  render={({ field }) => (
                    <Combobox
                      id="correspondence-template"
                      options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Choose a template…"
                      searchPlaceholder="Search templates…"
                      emptyText="No templates match."
                      aria-invalid={!!errors.templateId}
                    />
                  )}
                />
              )}
              <FieldError errors={errors.templateId ? [errors.templateId] : undefined} />
            </Field>

            {hasInitialAttachments && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Attachments</span>
                <p className="text-xs text-muted-foreground">
                  These files will be attached to the email. Remove any you don't want to send.
                </p>
                {attachmentsQuery.isPending ? (
                  <Skeleton className="h-12 w-full" />
                ) : selectedAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No files attached — the email will be sent without attachments.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    {selectedAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                      >
                        <PaperclipIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm" title={attachment.fileName}>
                          {attachment.fileName}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {formatFileSize(attachment.sizeBytes)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${attachment.fileName}`}
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    ))}
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {selectedAttachments.length} file
                      {selectedAttachments.length === 1 ? '' : 's'} ·{' '}
                      {formatFileSize(totalAttachmentBytes)} total
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Preview</span>
              <p className="text-xs text-muted-foreground">
                Filled in with this client's and policy's details. This is what will be sent.
              </p>
              {mergeQuery.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">
                    {subjectPreview || '(choose a template)'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-sm text-muted-foreground">
                    {bodyPreview || '(nothing to preview yet)'}
                  </p>
                </div>
              )}
            </div>

            {mutation.isError && (
              <div role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </div>
            )}
          </FieldGroup>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              isPending={mutation.isPending}
              pendingLabel="Sending…"
              disabled={attachmentsLoading}
            >
              Send
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RecipientFieldProps {
  legend: string
  name: 'to' | 'cc'
  fields: { id: string }[]
  values: string[]
  onRemove: (index: number) => void
  onAdd: (email: string) => void
  onFile: { id: number; email: string }[]
  error?: string
  fieldErrors: (string | undefined)[]
}

// One recipient list: the client's unused on-file addresses as one-click add
// chips (the "add existing vehicle" pattern from add-policy-dialog), the
// chosen addresses as removable rows, and a free-text input for an address
// that isn't on the client record - a lienholder, say. The server accepts
// off-file addresses here precisely so that last case works.
function RecipientField({
  legend,
  name,
  fields,
  values,
  onRemove,
  onAdd,
  onFile,
  error,
  fieldErrors,
}: RecipientFieldProps) {
  const [draft, setDraft] = useState('')

  function commitDraft() {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  return (
    <FieldSet data-invalid={!!error}>
      <FieldLegend variant="label">{legend}</FieldLegend>

      {fields.length > 0 && (
        <div className="flex flex-col gap-1">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              {/* The row shows the committed address, so it stays readable
                  while the zod message beside it explains any problem. */}
              <span className="text-sm" data-slot={`${name}-recipient`}>
                {values[index]}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${legend} recipient`}
                onClick={() => onRemove(index)}
              >
                <XIcon />
              </Button>
              {fieldErrors[index] && (
                <span className="text-xs text-destructive">{fieldErrors[index]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {onFile.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {onFile.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd(entry.email)}
            >
              <PlusIcon /> {entry.email}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="email"
          aria-label={`Add ${legend} address`}
          placeholder="name@example.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter in a lone text input would otherwise submit the whole
            // form; here it means "add this address".
            if (event.key !== 'Enter') return
            event.preventDefault()
            commitDraft()
          }}
        />
        <Button type="button" variant="outline" onClick={commitDraft} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FieldSet>
  )
}
