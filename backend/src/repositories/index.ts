// Repositories are pure data access - no req, no auth awareness. Authorization
// belongs at the controller/route layer, which will check req.user (once auth
// middleware exists) before or after calling into these functions. Don't thread
// an actor/context param through every repository call in anticipation of that.
//
// Every tenant-table repository takes a caller-supplied orgId as its first
// parameter and scopes every read/write to it, so a row in another
// organization answers exactly like a missing row (see
// docs/multitenancy.md's rollout). Five repositories are deliberately
// exempt, because what they wrap isn't a tenant table: `users` (global,
// keyed by email at login), `sessions` (a session carries an org, it isn't
// scoped by one - see schema.ts), `organizations` and `orgMemberships`
// (these define what an org *is*, not something an org owns), and `errors`
// (no data access at all).

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
