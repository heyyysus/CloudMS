import { sql } from "drizzle-orm"
import {
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

export const carriers = pgTable("carriers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  naic: varchar("naic", { length: 10 }).notNull().unique(),
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
