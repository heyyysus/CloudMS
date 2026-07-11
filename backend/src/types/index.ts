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
  policyStatusEnum,
  relationToInsuredEnum,
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

export type Person = typeof persons.$inferSelect
export type Driver = typeof drivers.$inferSelect
export type Client = typeof clients.$inferSelect
export type ClientPhone = typeof clientPhones.$inferSelect
export type ClientEmail = typeof clientEmails.$inferSelect
export type Carrier = typeof carriers.$inferSelect
export type AutoPolicy = typeof autoPolicies.$inferSelect
export type Vehicle = typeof vehicles.$inferSelect
export type PolicyDriver = typeof policyDrivers.$inferSelect
