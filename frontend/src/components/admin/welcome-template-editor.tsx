import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SubmitButton } from '@/components/ui/submit-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getEmailTemplate,
  updateEmailTemplate,
  type EmailTemplateResponse,
} from '@/api/emailTemplates'
import { useToast } from '@/components/ui/toast'

const WELCOME_TEMPLATE_KEY = 'welcome'

const templateFormSchema = z.object({
  subject: z.string().trim().min(1, 'Enter a subject').max(200, 'Max 200 characters'),
  body: z.string().trim().min(1, 'Enter a message').max(20000, 'Max 20000 characters'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

// Short descriptions for the merge-field chips. A field the server reports
// but that isn't listed here still renders, just without a description.
const MERGE_FIELD_HELP: Record<string, string> = {
  name: "Recipient's name (falls back to their email)",
  email: "Recipient's email address",
  role: 'Recipient\'s assigned role ("admin" or "staff")',
  appUrl: 'Link to the app',
  inviterName: "The admin who sent the invite",
}

interface WelcomeTemplateEditorProps {
  getEmailTemplateFn?: typeof getEmailTemplate
  updateEmailTemplateFn?: typeof updateEmailTemplate
}

export function WelcomeTemplateEditor({
  getEmailTemplateFn = getEmailTemplate,
  updateEmailTemplateFn = updateEmailTemplate,
}: WelcomeTemplateEditorProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const query = useQuery<EmailTemplateResponse>({
    queryKey: ['emailTemplate', WELCOME_TEMPLATE_KEY],
    queryFn: ({ signal }) => getEmailTemplateFn(WELCOME_TEMPLATE_KEY, signal),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: { subject: '', body: '' },
  })

  // Repopulate the form once the template loads (or reloads after a save).
  useEffect(() => {
    if (query.data) {
      reset({ subject: query.data.template.subject, body: query.data.template.body })
    }
  }, [query.data, reset])

  const mutation = useMutation({
    mutationFn: (values: TemplateFormValues) =>
      updateEmailTemplateFn(WELCOME_TEMPLATE_KEY, values),
    onSuccess: (data) => {
      queryClient.setQueryData(['emailTemplate', WELCOME_TEMPLATE_KEY], data)
      toast.success('Email template changes applied')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome email template</CardTitle>
        <CardDescription>
          Sent automatically when an admin invites a new user. Click a field below to insert it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {query.isError && (
          <p className="text-sm text-destructive">Couldn&apos;t load the template.</p>
        )}
        {query.data && (
          <form
            onSubmit={handleSubmit((values) =>
              mutation.mutate({ subject: values.subject.trim(), body: values.body.trim() })
            )}
            noValidate
          >
            <FieldGroup>
              <div className="flex flex-wrap gap-1.5">
                {query.data.mergeFields.map((field) => (
                  <button
                    key={field}
                    type="button"
                    title={MERGE_FIELD_HELP[field]}
                    className="rounded-full border border-input bg-transparent px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={(event) => {
                      const target = document.getElementById(
                        'welcome-template-body'
                      ) as HTMLTextAreaElement | null
                      if (!target) return
                      const { selectionStart, selectionEnd, value } = target
                      const token = `{{${field}}}`
                      target.value =
                        value.slice(0, selectionStart ?? value.length) +
                        token +
                        value.slice(selectionEnd ?? value.length)
                      target.dispatchEvent(new Event('input', { bubbles: true }))
                      target.focus()
                      event.preventDefault()
                    }}
                  >
                    {`{{${field}}}`}
                  </button>
                ))}
              </div>

              <Field data-invalid={!!errors.subject}>
                <FieldLabel htmlFor="welcome-template-subject">Subject</FieldLabel>
                <Input id="welcome-template-subject" {...register('subject')} />
                <FieldError errors={errors.subject ? [errors.subject] : undefined} />
              </Field>
              <Field data-invalid={!!errors.body}>
                <FieldLabel htmlFor="welcome-template-body">Body</FieldLabel>
                <Textarea id="welcome-template-body" rows={10} {...register('body')} />
                <FieldError errors={errors.body ? [errors.body] : undefined} />
              </Field>

              {mutation.isError && (
                <div role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </div>
              )}
              {mutation.isSuccess && (
                <div role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                  Saved.
                </div>
              )}
            </FieldGroup>

            <SubmitButton
              isPending={mutation.isPending}
              pendingLabel="Saving…"
              className="mt-4"
            >
              Save template
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
