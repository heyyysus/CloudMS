// Repositories are pure data access - no req, no auth awareness. Authorization
// belongs at the controller/route layer, which will check req.user (once auth
// middleware exists) before or after calling into these functions. Don't thread
// an actor/context param through every repository call in anticipation of that;
// none of the tables have an owner/tenant column today, so there's nothing to
// scope by yet. Add scoping params only to the specific functions that need them
// once a real ownership model exists.

export * from "./autoPolicies"
export * from "./carriers"
export * from "./clientEmails"
export * from "./clientPhones"
export * from "./clients"
export * from "./drivers"
export * from "./invoices"
export * from "./payments"
export * from "./persons"
export * from "./policyDrivers"
export * from "./policyLogs"
export * from "./receipts"
export * from "./search"
export * from "./sessions"
export * from "./trustLedger"
export * from "./users"
export * from "./vehicles"
