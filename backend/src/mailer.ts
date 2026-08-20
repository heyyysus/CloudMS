// Outbound transactional email via Resend's HTTP API. This lives server-side,
// mirroring vinDecoder.ts, so the vendor URL/key and response shape stay out
// of the client and every send goes through the app's own auth. Config is
// read inline from process.env per call (not cached at module load) so tests
// can stub it and so a missing key surfaces per-request rather than at boot.
const RESEND_ENDPOINT = "https://api.resend.com/emails"

const MAIL_TIMEOUT_MS = 10_000

// Raised when RESEND_API_KEY or MAIL_FROM isn't set, so the route can map it
// to a 503 instead of a confusing 502.
export class MailNotConfiguredError extends Error {}

// Raised when Resend is unreachable, times out, or answers non-2xx, so the
// route can map it to a 502 instead of letting it surface as a generic 500.
export class MailSendError extends Error {}

export interface SendEmailInput {
  to: string[]
  // Copied recipients. Resend omits the header entirely when absent, so an
  // empty list is normalized to undefined by the caller rather than sent.
  cc?: string[]
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  id: string
}

interface ResendSuccessResponse {
  id: string
}

interface ResendErrorResponse {
  name?: string
  message?: string
  statusCode?: number
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) {
    throw new MailNotConfiguredError("RESEND_API_KEY and MAIL_FROM must be set to send email")
  }

  const replyTo = process.env.MAIL_REPLY_TO

  let res: Response
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    })
  } catch (err) {
    throw new MailSendError(`Email send request failed: ${String(err)}`)
  }

  if (!res.ok) {
    let detail = `status ${res.status}`
    try {
      const body = (await res.json()) as ResendErrorResponse
      detail = `${body.name ?? res.status}: ${body.message ?? "unknown error"}`
    } catch {
      // Body wasn't JSON; fall back to the bare status above.
    }
    throw new MailSendError(`Email send failed: ${detail}`)
  }

  const body = (await res.json()) as ResendSuccessResponse
  return { id: body.id }
}

// Escapes text for safe interpolation into an HTML document.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Builds a minimal HTML body from a plain-text message. Every send pairs this
// with the original plain text as the `text` part - an HTML-only message
// scores worse with spam filters than a proper multipart message.
export function plainTextToHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/\n/g, "<br>")
  return `<div style="font-family: sans-serif; white-space: pre-wrap;">${escaped}</div>`
}
