// Repositories are pure data access - no req, no auth awareness. Authorization
// belongs at the controller/route layer, which will check req.user (once auth
// middleware exists) before or after calling into these functions. Don't thread
// an actor/context param through every repository call in anticipation of that;
// every tenant table now carries org_id (see docs/multitenancy.md rollout step
// 2). `persons`, `drivers`, `clients`, `clientPhones`, `clientEmails`,
// `carriers`, `autoPolicies`, `policyDrivers`, `vehicles` and `search` take a
// caller-supplied orgId and scope every read/write to it (rollout step 3,
// sub-issue 4 part 1); `policyLogs`, `policyAttachments`,
// `policyLogAttachments`, `invoices`, `payments`, `receipts` and `trustLedger`
// do the same (sub-issue 4 part 2, #120), with `invoices.invoiceNumber` /
// `receipts.receiptNumber` allocated per organization; email, reminders and
// the scheduler pick this up in sub-issue 7 (#121).

export * from "./autoPolicies"
export * from "./carriers"
export * from "./clientEmails"
export * from "./clientPhones"
export * from "./clients"
export * from "./drivers"
export * from "./emailLog"
export * from "./emailTemplates"
export * from "./errors"
export * from "./invoices"
export * from "./orgMemberships"
export * from "./organizations"
export * from "./payments"
export * from "./persons"
export * from "./policyAttachments"
export * from "./policyDrivers"
export * from "./policyLogAttachments"
export * from "./policyLogs"
export * from "./receipts"
export * from "./reminderRules"
export * from "./scheduledEmails"
export * from "./search"
export * from "./sessions"
export * from "./trustLedger"
export * from "./users"
export * from "./vehicles"
