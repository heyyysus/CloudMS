// Demo-mode support: a public demo deployment must never hold outbound
// credentials, and must not send mail, touch R2, or run the reminder
// scheduler. Config is read inline from process.env per call (not cached at
// module load), matching mailer.ts and storage/r2.ts, so tests can mutate it
// between cases.

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true"
}

// The credentials a demo instance may not hold. Kept as a list so the startup
// guard names every offender at once rather than failing one at a time.
export const FORBIDDEN_DEMO_ENV = [
  "RESEND_API_KEY",
  "MAIL_FROM",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const

// Pure so it can be unit-tested without spawning a process. Returns the names
// that are set; empty means safe to boot. An empty string counts as unset.
export function forbiddenDemoEnvPresent(env: NodeJS.ProcessEnv = process.env): string[] {
  return FORBIDDEN_DEMO_ENV.filter((name) => !!env[name])
}

// Thrown from the mail/storage seams. app.ts maps it to 403.
export class DemoDisabledError extends Error {}
