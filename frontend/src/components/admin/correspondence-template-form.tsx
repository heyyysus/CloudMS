import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type {
  CorrespondenceTemplate,
  CorrespondenceTemplateBody,
} from '@/api/correspondenceTemplates'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import {
  buildPreviewSamples,
  MERGE_FIELD_GROUP_ORDER,
  MERGE_FIELD_HELP,
  renderPreview,
  type MergeFieldGroup,
} from '@/lib/correspondence-merge-fields'

// Mirrors the server limits (createCorrespondenceTemplateBody).
const templateFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Max 120 characters'),
  subject: z.string().trim().min(1, 'Enter a subject').max(200, 'Max 200 characters'),
  body: z.string().trim().min(1, 'Enter a message').max(20000, 'Max 20000 characters'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

const BODY_FIELD_ID = 'correspondence-template-body'

function toDefaults(initial?: CorrespondenceTemplate): TemplateFormValues {
  return {
    name: initial?.name ?? '',
    subject: initial?.subject ?? '',
    body: initial?.body ?? '',
  }
}

interface CorrespondenceTemplateFormProps {
  initial?: CorrespondenceTemplate
  mergeFields: string[]
  // The signed-in user, for the agent merge fields in the preview. Omitted in
  // isolation (stories) — the static sample values are used instead.
  previewAgent?: { name: string | null; email: string }
  submitLabel: string
  pendingLabel: string
  onSubmit: (body: CorrespondenceTemplateBody) => void
  onCancel: () => void
  isPending?: boolean
  errorMessage?: string | null
}

// Inserts a {{field}} token at the caret of the body textarea, then dispatches
// an input event so react-hook-form's register picks the change up. Same
// approach as the welcome-template editor.
function insertToken(field: string) {
  const target = document.getElementById(BODY_FIELD_ID) as HTMLTextAreaElement | null
  if (!target) return
  const { selectionStart, selectionEnd, value } = target
  const token = `{{${field}}}`
  target.value =
    value.slice(0, selectionStart ?? value.length) +
    token +
    value.slice(selectionEnd ?? value.length)
  target.dispatchEvent(new Event('input', { bubbles: true }))
  target.focus()
}

export function CorrespondenceTemplateForm({
  initial,
  mergeFields,
  previewAgent,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: CorrespondenceTemplateFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: toDefaults(initial),
  })

  const samples = buildPreviewSamples(mergeFields, previewAgent)
  const subjectPreview = renderPreview(watch('subject') ?? '', samples)
  const bodyPreview = renderPreview(watch('body') ?? '', samples)

  // Group the server-provided fields for the chip rows; drop unknown ones into
  // an "Other" bucket so a new server field still renders.
  const grouped = new Map<MergeFieldGroup | 'Other', string[]>()
  for (const field of mergeFields) {
    const group = MERGE_FIELD_HELP[field]?.group ?? 'Other'
    const list = grouped.get(group) ?? []
    list.push(field)
    grouped.set(group, list)
  }
  const groupOrder: (MergeFieldGroup | 'Other')[] = [...MERGE_FIELD_GROUP_ORDER, 'Other']

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          subject: values.subject.trim(),
          body: values.body.trim(),
        })
      )}
      noValidate
    >
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="correspondence-template-name">Template name</FieldLabel>
          <Input id="correspondence-template-name" autoFocus {...register('name')} />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>

        <Field data-invalid={!!errors.subject}>
          <FieldLabel htmlFor="correspondence-template-subject">Subject</FieldLabel>
          <Input id="correspondence-template-subject" {...register('subject')} />
          <FieldError errors={errors.subject ? [errors.subject] : undefined} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Merge fields</span>
          <p className="text-xs text-muted-foreground">
            Click a field to insert it into the body at the cursor.
          </p>
          {groupOrder.map((group) => {
            const fields = grouped.get(group)
            if (!fields || fields.length === 0) return null
            return (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{group}</span>
                <div className="flex flex-wrap gap-1.5">
                  {fields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      title={MERGE_FIELD_HELP[field]?.label}
                      className="rounded-full border border-input bg-transparent px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(event) => {
                        insertToken(field)
                        event.preventDefault()
                      }}
                    >
                      {`{{${field}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <Field data-invalid={!!errors.body}>
          <FieldLabel htmlFor={BODY_FIELD_ID}>Body</FieldLabel>
          <Textarea id={BODY_FIELD_ID} rows={10} {...register('body')} />
          <FieldError errors={errors.body ? [errors.body] : undefined} />
        </Field>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Preview</span>
          <p className="text-xs text-muted-foreground">
            Rendered with sample data. Real values are filled in when the template is sent.
          </p>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">{subjectPreview || '(no subject)'}</p>
            <p className="mt-2 whitespace-pre-wrap font-mono text-sm text-muted-foreground">
              {bodyPreview || '(empty body)'}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton isPending={isPending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  )
}
