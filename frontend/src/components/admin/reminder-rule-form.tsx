import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ReminderRule, ReminderRuleBody } from '@/api/reminders'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SubmitButton } from '@/components/ui/submit-button'
import { formatOffsetDays } from '@/lib/reminder-options'

// Mirrors the server limits (createReminderRuleBody).
const ruleFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Max 120 characters'),
  offsetDays: z
    .number({ message: 'Enter a number of days' })
    .int('Whole days only')
    .min(-730, 'At most 730 days after expiration')
    .max(730, 'At most 730 days before expiration'),
  templateId: z.number({ message: 'Pick a template' }).int().positive('Pick a template'),
})

type RuleFormValues = z.infer<typeof ruleFormSchema>

interface ReminderRuleFormProps {
  initial?: ReminderRule
  templates: CorrespondenceTemplate[]
  submitLabel: string
  pendingLabel: string
  onSubmit: (body: ReminderRuleBody) => void
  onCancel: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function ReminderRuleForm({
  initial,
  templates,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: ReminderRuleFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      offsetDays: initial?.offsetDays ?? 30,
      templateId: initial?.templateId ?? (templates[0]?.id ?? 0),
    },
  })

  const offsetDays = watch('offsetDays')

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reminder-rule-name">Name</FieldLabel>
          <Input id="reminder-rule-name" placeholder="30-day renewal reminder" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="reminder-rule-offset">Days before expiration</FieldLabel>
          <Input
            id="reminder-rule-offset"
            type="number"
            {...register('offsetDays', { valueAsNumber: true })}
          />
          {/* Restates the number in words, because a negative offset reads
              backwards and is easy to enter by accident. */}
          <p className="text-xs text-muted-foreground">
            {Number.isFinite(offsetDays) ? formatOffsetDays(offsetDays) : 'Enter a number of days'}
          </p>
          {errors.offsetDays && <FieldError>{errors.offsetDays.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="reminder-rule-template">Template</FieldLabel>
          <Controller
            control={control}
            name="templateId"
            render={({ field }) => (
              <Select
                value={field.value ? String(field.value) : undefined}
                onValueChange={(next) => field.onChange(Number(next))}
              >
                <SelectTrigger id="reminder-rule-template">
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {/* Automated sends have no logged-in agent behind them, so this one
              merge field resolves differently than it does on a manual send. */}
          <p className="text-xs text-muted-foreground">
            On an automated send, <code>{'{{agentName}}'}</code> renders the agency name rather
            than a staff member.
          </p>
          {errors.templateId && <FieldError>{errors.templateId.message}</FieldError>}
        </Field>
      </FieldGroup>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="flex justify-end gap-2">
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
