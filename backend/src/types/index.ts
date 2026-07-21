import type {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  driverRatingEnum,
  drivers,
  genderEnum,
  maritalStatusEnum,
  persons,
  policyDrivers,
  policyLogs,
  policyStatusEnum,
  relationToInsuredEnum,
  sessions,
  userRoleEnum,
  users,
  vehicles,
} from "../db/schema"

// Inferred from the Drizzle schema so these stay in sync automatically.
// Move this file (with db/schema.ts) into a real shared package once a
// frontend exists.

export type Gender = (typeof genderEnum.enumValues)[number]
export type MaritalStatus = (typeof maritalStatusEnum.enumValues)[number]
export type RelationToInsured = (typeof relationToInsuredEnum.enumValues)[number]
export type DriverRating = (typeof driverRatingEnum.enumValues)[number]
export type PolicyStatus = (typeof policyStatusEnum.enumValues)[number]
export type UserRole = (typeof userRoleEnum.enumValues)[number]

export type Person = typeof persons.$inferSelect
export type Driver = typeof drivers.$inferSelect
export type Client = typeof clients.$inferSelect
export type ClientPhone = typeof clientPhones.$inferSelect
export type ClientEmail = typeof clientEmails.$inferSelect
export type Carrier = typeof carriers.$inferSelect
export type AutoPolicy = typeof autoPolicies.$inferSelect
export type Vehicle = typeof vehicles.$inferSelect
export type PolicyDriver = typeof policyDrivers.$inferSelect
export type PolicyLog = typeof policyLogs.$inferSelect
export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect

export type NewPerson = typeof persons.$inferInsert
export type NewDriver = typeof drivers.$inferInsert
export type NewClient = typeof clients.$inferInsert
export type NewClientPhone = typeof clientPhones.$inferInsert
export type NewClientEmail = typeof clientEmails.$inferInsert
export type NewCarrier = typeof carriers.$inferInsert
export type NewAutoPolicy = typeof autoPolicies.$inferInsert
export type NewVehicle = typeof vehicles.$inferInsert
export type NewPolicyDriver = typeof policyDrivers.$inferInsert
export type NewPolicyLog = typeof policyLogs.$inferInsert
export type NewUser = typeof users.$inferInsert
export type NewSession = typeof sessions.$inferInsert

declare global {
  // Declaration merging into Express's types requires a namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User
    }
  }
}
