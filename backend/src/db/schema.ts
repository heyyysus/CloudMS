import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

export const genderEnum = pgEnum("gender", ["m", "f", "other"])

export const maritalStatusEnum = pgEnum("marital_status", [
  "single",
  "married",
  "divorced",
  "widowed",
  "separated",
])

export const relationToInsuredEnum = pgEnum("relation_to_insured", [
  "self",
  "spouse",
  "child",
  "sibling",
  "significant-other",
  "other-related",
  "other",
])

export const driverRatingEnum = pgEnum("driver_rating", ["rated", "excluded"])

export const policyStatusEnum = pgEnum("policy_status", [
  "pending",
  "active",
  "cancelled",
  "expired",
])

export const userRoleEnum = pgEnum("user_role", ["admin", "staff"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 150 }),
  googleSub: varchar("google_sub", { length: 64 }).unique(),
  role: userRoleEnum("role").notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  // Set only by POST /auth/demo on a demo instance (DEMO_MODE=true). Lets
  // visibleToAdmin() hide these rows from GET /users without a separate table.
  isDemo: boolean("is_demo").notNull().default(false),
  // A deleted user is hidden from the admin list and can never sign in, but
  // the row stays: policy_logs.author_id and eight other NOT NULL FKs point
  // at it, so the audit trail would break if the row went away. Distinct
  // from isActive, which is a reversible "disable" the admin can see and undo.
  deletedAt: timestamp("deleted_at"),
  deletedBy: integer("deleted_by").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
)

// Distinguishes the singleton "welcome" invite email (scoped to a staff
// user's own info) from admin-authored client "correspondence" templates
// (scoped to a client, their policy, and the sending agent).
export const emailTemplateKindEnum = pgEnum("email_template_kind", ["welcome", "correspondence"])

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  // Admin-facing label for correspondence templates; null for the welcome row.
  name: varchar("name", { length: 120 }),
  kind: emailTemplateKindEnum("kind").notNull().default("correspondence"),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const emailLogStatusEnum = pgEnum("email_log_status", ["sent", "failed"])

export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    // Plain varchar, not an FK to email_templates.key - the log must survive
    // template renames/deletes.
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    // text, not varchar(200): merge-field expansion can push a rendered
    // subject past the template's own 200-char cap.
    subject: text("subject").notNull(),
    resendId: varchar("resend_id", { length: 64 }), // null when the send failed
    status: emailLogStatusEnum("status").notNull(),
    error: text("error"), // failure detail, null on success
    triggeredBy: integer("triggered_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [index("email_log_recipient_idx").on(table.recipient)]
)

// A standing instruction to send a correspondence template off a date on the
// policy - the "renewal reminder 30 days out" rule an admin configures once.
// Rules are the schedule; scheduled_emails below is what the schedule produced.
export const reminderTriggerEnum = pgEnum("reminder_trigger", ["policy_expiration"])

export const reminderRules = pgTable(
  "reminder_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    trigger: reminderTriggerEnum("trigger").notNull(),
    // Days before the trigger date. A negative value sends after it (-7 is a
    // week past expiration), which is why this is a plain integer rather than
    // a positive-only check.
    offsetDays: integer("offset_days").notNull(),
    templateId: integer("template_id")
      .notNull()
      .references(() => emailTemplates.id),
    // Defaults to false so a newly-created rule can never send before an
    // admin has read it back and turned it on deliberately.
    enabled: boolean("enabled").notNull().default(false),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("reminder_rules_trigger_offset_unique").on(table.trigger, table.offsetDays)]
)

export const scheduledEmailStatusEnum = pgEnum("scheduled_email_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
])

// One planned send. The planner writes rows here idempotently and the
// dispatcher drains them; email_log remains the permanent record of what
// actually went out, so this table is a queue, not the audit trail - which is
// why deleting a rule is allowed to cascade its rows away.
export const scheduledEmails = pgTable(
  "scheduled_emails",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => reminderRules.id, { onDelete: "cascade" }),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    // The trigger date this row is for - the policy's expiration_date as of
    // planning. Renewing a policy moves that date and legitimately mints a new
    // occurrence; re-planning an existing one hits the unique below and is a
    // no-op, which is what makes the planner safe to run on every tick.
    occurrenceDate: date("occurrence_date").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    status: scheduledEmailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Stamped when a dispatcher claims the row; the reaper uses it to release
    // rows left in "sending" by a container that died mid-send.
    claimedAt: timestamp("claimed_at"),
    lastError: text("last_error"),
    // Rendered subject, filled in on a successful send.
    subject: text("subject"),
    resendId: varchar("resend_id", { length: 64 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("scheduled_emails_occurrence_unique").on(
      table.ruleId,
      table.policyId,
      table.occurrenceDate
    ),
    index("scheduled_emails_due_idx").on(table.status, table.scheduledFor),
    index("scheduled_emails_policy_id_idx").on(table.policyId),
  ]
)

export const persons = pgTable(
  "persons",
  {
    id: serial("id").primaryKey(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    maritalStatus: maritalStatusEnum("marital_status"),
    gender: genderEnum("gender").notNull(),
    relationToInsured: relationToInsuredEnum("relation_to_insured").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("persons_first_name_trgm_idx").using("gin", table.firstName.op("gin_trgm_ops")),
    index("persons_last_name_trgm_idx").using("gin", table.lastName.op("gin_trgm_ops")),
    index("persons_full_name_trgm_idx").using(
      "gin",
      sql`(${table.firstName} || ' ' || ${table.lastName}) gin_trgm_ops`
    ),
  ]
)

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .unique()
    .references(() => persons.id, { onDelete: "cascade" }),
  dlNumber: varchar("dl_number", { length: 50 }),
  rating: driverRatingEnum("rating").notNull().default("rated"),
  sr22: boolean("sr22").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    namedInsuredId: integer("named_insured_id")
      .notNull()
      .references(() => persons.id),
    secondNamedInsuredId: integer("second_named_insured_id").references(() => persons.id),
    mailingAddress1: text("mailing_address1"),
    mailingAddress2: text("mailing_address2"),
    mailingCity: varchar("mailing_city", { length: 100 }),
    mailingState: varchar("mailing_state", { length: 2 }),
    mailingZip: varchar("mailing_zip", { length: 10 }),
    physicalAddress1: text("physical_address1"),
    physicalAddress2: text("physical_address2"),
    physicalCity: varchar("physical_city", { length: 100 }),
    physicalState: varchar("physical_state", { length: 2 }),
    physicalZip: varchar("physical_zip", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("clients_mailing_addr_trgm_idx").using(
      "gin",
      sql`(coalesce(${table.mailingAddress1}, '') || ' ' || coalesce(${table.mailingAddress2}, '') || ' ' || coalesce(${table.mailingCity}, '') || ' ' || coalesce(${table.mailingState}, '') || ' ' || coalesce(${table.mailingZip}, '')) gin_trgm_ops`
    ),
    index("clients_physical_addr_trgm_idx").using(
      "gin",
      sql`(coalesce(${table.physicalAddress1}, '') || ' ' || coalesce(${table.physicalAddress2}, '') || ' ' || coalesce(${table.physicalCity}, '') || ' ' || coalesce(${table.physicalState}, '') || ' ' || coalesce(${table.physicalZip}, '')) gin_trgm_ops`
    ),
  ]
)

export const clientPhones = pgTable(
  "client_phones",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("client_phones_client_id_idx").on(table.clientId),
    index("client_phones_phone_number_trgm_idx").using("gin", table.phoneNumber.op("gin_trgm_ops")),
  ]
)

export const clientEmails = pgTable(
  "client_emails",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("client_emails_client_id_idx").on(table.clientId),
    index("client_emails_email_trgm_idx").using("gin", table.email.op("gin_trgm_ops")),
  ]
)

// Carriers are never deleted once a policy references them (every FK is ON
// DELETE no action), so retiring one is `isActive = false`: it drops out of
// the carrier picker for new policies but stays readable on existing records.
export const carriers = pgTable("carriers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  naic: varchar("naic", { length: 10 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  producerCode: varchar("producer_code", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const autoPolicies = pgTable(
  "auto_policies",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    carrierId: integer("carrier_id")
      .notNull()
      .references(() => carriers.id),
    policyNumber: varchar("policy_number", { length: 50 }).notNull().unique(),
    policyAddress1: text("policy_address1"),
    policyAddress2: text("policy_address2"),
    policyCity: varchar("policy_city", { length: 100 }),
    policyState: varchar("policy_state", { length: 2 }),
    policyZip: varchar("policy_zip", { length: 10 }),
    effectiveDate: date("effective_date").notNull(),
    expirationDate: date("expiration_date").notNull(),
    status: policyStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("auto_policies_client_id_idx").on(table.clientId),
    index("auto_policies_policy_number_trgm_idx").using(
      "gin",
      table.policyNumber.op("gin_trgm_ops")
    ),
    index("auto_policies_policy_addr_trgm_idx").using(
      "gin",
      sql`(coalesce(${table.policyAddress1}, '') || ' ' || coalesce(${table.policyAddress2}, '') || ' ' || coalesce(${table.policyCity}, '') || ' ' || coalesce(${table.policyState}, '') || ' ' || coalesce(${table.policyZip}, '')) gin_trgm_ops`
    ),
  ]
)

export const vehicles = pgTable(
  "vehicles",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    vin: varchar("vin", { length: 17 }).notNull(),
    make: varchar("make", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    year: integer("year").notNull(),
    garagingZip: varchar("garaging_zip", { length: 10 }).notNull(),
    coverageBi: varchar("coverage_bi", { length: 50 }),
    coveragePd: varchar("coverage_pd", { length: 50 }),
    coverageUmbi: varchar("coverage_umbi", { length: 50 }),
    coverageUmpd: varchar("coverage_umpd", { length: 50 }),
    coverageCdw: varchar("coverage_cdw", { length: 50 }),
    coverageMedpay: varchar("coverage_medpay", { length: 50 }),
    coverageColl: varchar("coverage_coll", { length: 50 }),
    coverageComp: varchar("coverage_comp", { length: 50 }),
    coverageRentalReimbursement: varchar("coverage_rental_reimbursement", { length: 50 }),
    coverageTowing: varchar("coverage_towing", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("vehicles_policy_id_idx").on(table.policyId),
    unique("vehicles_policy_id_vin_unique").on(table.policyId, table.vin),
  ]
)

export const policyDrivers = pgTable(
  "policy_drivers",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    driverId: integer("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.policyId, table.driverId)]
)

// Append-only notes attached to a policy. logNumber is a per-policy counter
// (1, 2, 3, ...) assigned in a transaction by the repository, not by the DB;
// the unique constraint below just guards against a race producing
// duplicates. There is no updatedAt and no update/delete path - logs are
// immutable once created.
export const policyLogs = pgTable(
  "policy_logs",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    logNumber: integer("log_number").notNull(),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("policy_logs_policy_id_idx").on(table.policyId),
    unique("policy_logs_policy_id_log_number_unique").on(table.policyId, table.logNumber),
  ]
)

// What produced an attachment. "upload" is a staff member picking a file;
// the rest are server-generated documents, and their sourceId points at the
// record they document (the policy, invoice, or receipt).
export const attachmentSourceTypeEnum = pgEnum("attachment_source_type", [
  "upload",
  "policy_change",
  "invoice",
  "receipt",
])

// Files (declarations pages, ID cards, correspondence, etc.) uploaded direct
// to R2 and linked to a policy. storageKey is the R2 object key; the actual
// URL is never stored - download links are minted on demand as short-lived
// presigned URLs. Append-only like policyLogs: no delete, and the only update
// is flipping isVoided when the invoice/payment a document records is voided.
export const policyAttachments = pgTable(
  "policy_attachments",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    description: text("description"),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Set when the record this document describes is voided. The R2 object is
    // kept either way; this only hides the row from staff (admins still see it,
    // marked void) so the audit trail survives.
    isVoided: boolean("is_voided").notNull().default(false),
    sourceType: attachmentSourceTypeEnum("source_type").notNull().default("upload"),
    // Null for uploads; otherwise the id of the policy/invoice/receipt.
    sourceId: integer("source_id"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("policy_attachments_policy_id_idx").on(table.policyId),
    index("policy_attachments_source_idx").on(table.sourceType, table.sourceId),
  ]
)

// Ties an attachment to a log, so opening a log shows the documents that
// belong to it. Both sides are append-only but the link itself is not - it is
// an editorial association, and staff can undo one from the log's dialog.
// Links never cross policies; the route checks both ends resolve to the same
// one. Server-generated documents link themselves to the log the same action
// wrote, so a change form or receipt arrives already attached.
export const policyLogAttachments = pgTable(
  "policy_log_attachments",
  {
    id: serial("id").primaryKey(),
    logId: integer("log_id")
      .notNull()
      .references(() => policyLogs.id, { onDelete: "cascade" }),
    attachmentId: integer("attachment_id")
      .notNull()
      .references(() => policyAttachments.id, { onDelete: "cascade" }),
    // Who made the association, which the log's dialog credits. Not the same
    // as the attachment's own uploader.
    linkedBy: integer("linked_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("policy_log_attachments_log_id_idx").on(table.logId),
    index("policy_log_attachments_attachment_id_idx").on(table.attachmentId),
    unique("policy_log_attachments_log_id_attachment_id_unique").on(
      table.logId,
      table.attachmentId
    ),
  ]
)

// ---------------------------------------------------------------------------
// Accounting
//
// The agency runs a trust-accounting model: a client pays the agency, the
// money sits in the agency trust account, and on full payment the agency
// "sweeps" the carrier's share out to the carrier and keeps its fee. Every
// transaction is a policy-scoped invoice (one or more line items) plus the
// payments made against it; each payment mints a receipt. Money is stored as
// numeric(12,2) (exact decimal). Records are immutable - corrections are made
// by voiding, which posts reversing trust-ledger entries rather than editing
// or deleting rows.
// ---------------------------------------------------------------------------

export const invoiceStatusEnum = pgEnum("invoice_status", ["open", "closed", "void"])

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "check",
  "credit_card",
  "debit_card",
])

// Two line-item categories: "sweep" items are the carrier's share (money that
// leaves the trust account to the carrier); "agency" items are the agency's
// fee (money that goes to the agency).
export const invoiceItemCategoryEnum = pgEnum("invoice_item_category", ["sweep", "agency"])

export const invoiceItemTypeEnum = pgEnum("invoice_item_type", [
  "new_business_sweep",
  "installment_payment_sweep",
  "endorsement_sweep",
  "new_business_fee",
  "installment_payment_fee",
  "endorsement_fee",
])

// A trust-ledger row records one movement of money in or out of the agency
// trust account. Balance = sum(in) - sum(out). Reversals are ordinary rows in
// the opposite direction with reversalOfId set to the entry they cancel.
export const trustLedgerEntryTypeEnum = pgEnum("trust_ledger_entry_type", [
  "payment_received",
  "carrier_sweep",
  "agency_fee",
])

export const trustLedgerDirectionEnum = pgEnum("trust_ledger_direction", ["in", "out"])

export const invoices = pgTable(
  "invoices",
  {
    // id doubles as the agency-wide sequential invoice number.
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    // Denormalized from the policy so invoices are directly filterable by
    // client without a join.
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    status: invoiceStatusEnum("status").notNull().default("open"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note"),
    voidedAt: timestamp("voided_at"),
    voidedBy: integer("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoices_policy_id_idx").on(table.policyId),
    index("invoices_client_id_idx").on(table.clientId),
  ]
)

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    category: invoiceItemCategoryEnum("category").notNull(),
    type: invoiceItemTypeEnum("type").notNull(),
    // Required for "sweep" items (which carrier the money goes to), null for
    // "agency" items. Enforced in the repository/validation layer.
    carrierId: integer("carrier_id").references(() => carriers.id),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invoice_items_invoice_id_idx").on(table.invoiceId)]
)

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    method: paymentMethodEnum("method").notNull(),
    // amount = what the client handed over; amountApplied = the part applied to
    // the invoice; changeGiven = amount - amountApplied (returned to the
    // client, never held in trust).
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    amountApplied: numeric("amount_applied", { precision: 12, scale: 2 }).notNull(),
    changeGiven: numeric("change_given", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    voidedAt: timestamp("voided_at"),
    voidedBy: integer("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("payments_invoice_id_idx").on(table.invoiceId),
    index("payments_policy_id_idx").on(table.policyId),
    index("payments_client_id_idx").on(table.clientId),
  ]
)

export const receipts = pgTable(
  "receipts",
  {
    // id doubles as the agency-wide sequential receipt number.
    id: serial("id").primaryKey(),
    // One receipt per payment.
    paymentId: integer("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    // Snapshot of the payment's effect on the invoice at receipt time.
    amountApplied: numeric("amount_applied", { precision: 12, scale: 2 }).notNull(),
    changeGiven: numeric("change_given", { precision: 12, scale: 2 }).notNull().default("0"),
    amountDueAfter: numeric("amount_due_after", { precision: 12, scale: 2 }).notNull(),
    invoiceClosed: boolean("invoice_closed").notNull(),
    note: text("note"),
    voidedAt: timestamp("voided_at"),
    voidedBy: integer("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("receipts_invoice_id_idx").on(table.invoiceId),
    index("receipts_policy_id_idx").on(table.policyId),
    index("receipts_client_id_idx").on(table.clientId),
  ]
)

export const trustLedger = pgTable(
  "trust_ledger",
  {
    id: serial("id").primaryKey(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => autoPolicies.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    paymentId: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }),
    invoiceItemId: integer("invoice_item_id").references(() => invoiceItems.id, {
      onDelete: "cascade",
    }),
    // Set on carrier_sweep entries (which carrier the money went to).
    carrierId: integer("carrier_id").references(() => carriers.id),
    entryType: trustLedgerEntryTypeEnum("entry_type").notNull(),
    direction: trustLedgerDirectionEnum("direction").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // References another trust_ledger row this one reverses (void path).
    reversalOfId: integer("reversal_of_id"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("trust_ledger_policy_id_idx").on(table.policyId),
    index("trust_ledger_client_id_idx").on(table.clientId),
    index("trust_ledger_invoice_id_idx").on(table.invoiceId),
  ]
)
