import { createInsertSchema } from "drizzle-zod"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  persons,
  policyDrivers,
  policyLogs,
  users,
  vehicles,
} from "./schema"

export const insertPersonSchema = createInsertSchema(persons)
export const updatePersonSchema = insertPersonSchema.partial()

export const insertDriverSchema = createInsertSchema(drivers)
export const updateDriverSchema = insertDriverSchema.partial()

export const insertClientSchema = createInsertSchema(clients)
export const updateClientSchema = insertClientSchema.partial()

export const insertClientPhoneSchema = createInsertSchema(clientPhones)
export const updateClientPhoneSchema = insertClientPhoneSchema.partial()

export const insertClientEmailSchema = createInsertSchema(clientEmails)
export const updateClientEmailSchema = insertClientEmailSchema.partial()

export const insertCarrierSchema = createInsertSchema(carriers)
export const updateCarrierSchema = insertCarrierSchema.partial()

export const insertAutoPolicySchema = createInsertSchema(autoPolicies)
export const updateAutoPolicySchema = insertAutoPolicySchema.partial()

export const insertVehicleSchema = createInsertSchema(vehicles)
export const updateVehicleSchema = insertVehicleSchema.partial()

export const insertPolicyDriverSchema = createInsertSchema(policyDrivers)

export const insertPolicyLogSchema = createInsertSchema(policyLogs)

export const insertUserSchema = createInsertSchema(users)
export const updateUserSchema = insertUserSchema.partial()
