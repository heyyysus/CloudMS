import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
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
  dlNumber: varchar("dl_number", { length: 50 }).notNull(),
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
    mailingAddress: text("mailing_address"),
    physicalAddress: text("physical_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("clients_mailing_address_trgm_idx").using(
      "gin",
      table.mailingAddress.op("gin_trgm_ops")
    ),
    index("clients_physical_address_trgm_idx").using(
      "gin",
      table.physicalAddress.op("gin_trgm_ops")
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
    index("client_phones_phone_number_trgm_idx").using(
      "gin",
      table.phoneNumber.op("gin_trgm_ops")
    ),
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
    policyAddress: text("policy_address"),
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
    index("auto_policies_policy_address_trgm_idx").using(
      "gin",
      table.policyAddress.op("gin_trgm_ops")
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
    vin: varchar("vin", { length: 17 }).notNull().unique(),
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
  (table) => [index("vehicles_policy_id_idx").on(table.policyId)]
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
