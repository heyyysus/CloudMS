// Composes and sends templated transactional emails, on top of the raw
// send in mailer.ts. Routes never call sendEmail directly for these - they
// call the functions here, which load the template, merge fields, send, and
// log the attempt to email_log. Keeps the merge-field/template concerns out
// of the route layer and the logging concern out of the repository layer.
import { DemoDisabledError } from "./config"
import { findEmailTemplateByKey } from "./repositories/emailTemplates"
import { createEmailLogEntry } from "./repositories/emailLog"
import { MailNotConfiguredError, MailSendError, plainTextToHtml, sendEmail } from "./mailer"
import type { User } from "./types"

export const WELCOME_TEMPLATE_KEY = "welcome"

// The only fields the welcome template is allowed to reference. Exposed to
// the frontend (via the GET /email-templates/:key response) so the template
// editor's merge-field help stays in sync with what's actually usable.
export const WELCOME_MERGE_FIELDS = ["name", "email", "role", "appUrl", "inviterName"] as const

// The merge fields admin-authored client correspondence templates may
// reference: the client profile, their policy, and the sending agent (the
// logged-in user). Source of truth for server-side validation; also served
// to the template editor so its merge-field chips stay in sync.
export const CORRESPONDENCE_MERGE_FIELDS = [
  // Client profile
  "clientFirstName",
  "clientLastName",
  "clientFullName",
  "clientEmail",
  "clientPhone",
  "clientAddress",
  "clientCity",
  "clientState",
  "clientZip",
  // Policy
  "policyNumber",
  "carrierName",
  "policyEffectiveDate",
  "policyExpirationDate",
  "policyStatus",
  // Sending agent (current user)
  "agentName",
  "agentEmail",
] as const

// Returns the distinct {{field}} names referenced in a template string, in
// first-seen order.
export function extractMergeFields(template: string): string[] {
  const matches = template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)
  const seen = new Set<string>()
  for (const match of matches) seen.add(match[1])
  return [...seen]
}

// Replaces every {{field}} with fields[field]; a field with no entry in
// `fields` renders as "". Templates are plain text - the caller is expected
// to run the result through plainTextToHtml for the HTML part, which escapes
// the whole string, so no per-field HTML escaping happens here.
export function renderTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g,
    (_match, field: string) => fields[field] ?? ""
  )
}

export interface SendWelcomeEmailResult {
  status: "sent" | "failed"
  resendId?: string
  error?: string
}

// Sends the welcome/invite email to a newly-created user. Never throws for
// mail configuration/delivery problems - those come back as a "failed"
// result so the caller (the invite route) can still return 201 for the user
// row it already created; a missing template or a logging failure is a
// broken-install condition and is left to propagate as a 500.
export async function sendWelcomeEmail(
  user: User,
  invitedBy: User
): Promise<SendWelcomeEmailResult> {
  const template = await findEmailTemplateByKey(WELCOME_TEMPLATE_KEY)
  if (!template) {
    throw new Error(`Email template "${WELCOME_TEMPLATE_KEY}" is missing`)
  }

  const fields: Record<string, string> = {
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
    appUrl: process.env.APP_URL ?? "",
    inviterName: invitedBy.name ?? invitedBy.email,
  }

  const subject = renderTemplate(template.subject, fields)
  const text = renderTemplate(template.body, fields)
  const html = plainTextToHtml(text)

  try {
    const result = await sendEmail({ to: [user.email], subject, html, text })
    await createEmailLogEntry({
      recipient: user.email,
      templateKey: WELCOME_TEMPLATE_KEY,
      subject,
      resendId: result.id,
      status: "sent",
      triggeredBy: invitedBy.id,
    })
    return { status: "sent", resendId: result.id }
  } catch (err) {
    let error: string
    if (err instanceof DemoDisabledError) {
      error = "Disabled in demo mode"
    } else if (err instanceof MailNotConfiguredError) {
      error = "Email sending is not configured"
    } else if (err instanceof MailSendError) {
      error = "Email delivery is unavailable"
    } else {
      throw err
    }
    await createEmailLogEntry({
      recipient: user.email,
      templateKey: WELCOME_TEMPLATE_KEY,
      subject,
      resendId: null,
      status: "failed",
      error,
      triggeredBy: invitedBy.id,
    })
    return { status: "failed", error }
  }
}

// The client and policy shape buildCorrespondenceMergeValues needs, declared
// structurally rather than as the repositories' return types: the real
// getClientWithDetails/getPolicyWithDetails results assign to these, but
// tests can build a literal without touching the DB.
export interface CorrespondenceClient {
  namedInsured: { firstName: string; lastName: string }
  emails: { email: string }[]
  phones: { phoneNumber: string }[]
  mailingAddress1: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  physicalAddress1: string | null
  physicalCity: string | null
  physicalState: string | null
  physicalZip: string | null
}

export interface CorrespondencePolicy {
  policyNumber: string
  effectiveDate: string
  expirationDate: string
  status: string
  carrier: { name: string }
}

// Whoever the message is "from" as far as the merge fields are concerned.
// Structural like the two above rather than `User`, because an automated send
// has no logged-in agent and passes the agency's own identity instead.
export interface CorrespondenceAgent {
  name: string | null
  email: string
}

// Resolves every name in CORRESPONDENCE_MERGE_FIELDS to a string for a real
// client/policy/agent. Every value coalesces to "" rather than null so the
// result matches what renderTemplate does with a missing key - a template
// referencing an address the client hasn't given us renders a blank, not the
// word "null".
export function buildCorrespondenceMergeValues(input: {
  client: CorrespondenceClient
  policy: CorrespondencePolicy
  agent: CorrespondenceAgent
}): Record<string, string> {
  const { client, policy, agent } = input
  // Mailing address is the one the agency writes to; fall back to physical so
  // a client with only a physical address on file still merges cleanly.
  const address = client.mailingAddress1
    ? {
        line1: client.mailingAddress1,
        city: client.mailingCity,
        state: client.mailingState,
        zip: client.mailingZip,
      }
    : {
        line1: client.physicalAddress1,
        city: client.physicalCity,
        state: client.physicalState,
        zip: client.physicalZip,
      }

  return {
    clientFirstName: client.namedInsured.firstName,
    clientLastName: client.namedInsured.lastName,
    clientFullName: `${client.namedInsured.firstName} ${client.namedInsured.lastName}`,
    clientEmail: client.emails[0]?.email ?? "",
    clientPhone: client.phones[0]?.phoneNumber ?? "",
    clientAddress: address.line1 ?? "",
    clientCity: address.city ?? "",
    clientState: address.state ?? "",
    clientZip: address.zip ?? "",
    policyNumber: policy.policyNumber,
    carrierName: policy.carrier.name,
    policyEffectiveDate: policy.effectiveDate,
    policyExpirationDate: policy.expirationDate,
    policyStatus: policy.status,
    agentName: agent.name ?? agent.email,
    agentEmail: agent.email,
  }
}

// Body for the policy_logs row a send appends, so a policy's running history
// holds a faithful record of exactly what the client received — recipients,
// subject, and the full rendered body, not just a summary. A pure string
// builder like the ones in accountingLogs.ts, so the wording is unit-testable
// without a DB.
export function correspondenceSentLogBody(input: {
  to: string[]
  cc: string[]
  subject: string
  body: string
}): string {
  const lines = [`To: ${input.to.join(", ")}`]
  if (input.cc.length > 0) lines.push(`Cc: ${input.cc.join(", ")}`)
  lines.push(`Subject: ${input.subject}`, "", input.body)
  return lines.join("\n")
}

export interface SendCorrespondenceEmailResult {
  resendId: string
  subject: string
  body: string
}

// Sends an admin-authored correspondence template to a client. Unlike
// sendWelcomeEmail, mail failures are rethrown after logging: the caller here
// is a user waiting on a Send click, so the route maps them to 503/502 rather
// than reporting success. Every address - to and cc alike - gets its own
// email_log row so the recipient index answers "did we ever email this
// person?" regardless of which header they were on.
export async function sendCorrespondenceEmail(input: {
  template: { key: string; subject: string; body: string }
  values: Record<string, string>
  to: string[]
  cc: string[]
  triggeredBy: number
}): Promise<SendCorrespondenceEmailResult> {
  const { template, values, to, cc, triggeredBy } = input

  const subject = renderTemplate(template.subject, values)
  const text = renderTemplate(template.body, values)
  const html = plainTextToHtml(text)

  const logAll = async (entry: {
    resendId: string | null
    status: "sent" | "failed"
    error?: string
  }) => {
    for (const recipient of [...to, ...cc]) {
      await createEmailLogEntry({
        recipient,
        templateKey: template.key,
        subject,
        resendId: entry.resendId,
        status: entry.status,
        error: entry.error,
        triggeredBy,
      })
    }
  }

  try {
    const result = await sendEmail({ to, cc: cc.length > 0 ? cc : undefined, subject, html, text })
    await logAll({ resendId: result.id, status: "sent" })
    return { resendId: result.id, subject, body: text }
  } catch (err) {
    if (
      err instanceof MailNotConfiguredError ||
      err instanceof MailSendError ||
      err instanceof DemoDisabledError
    ) {
      await logAll({ resendId: null, status: "failed", error: err.message })
    }
    throw err
  }
}
