import { z } from "zod"
import {
  insertAutoPolicySchema,
  insertCarrierSchema,
  insertClientSchema,
  insertPersonSchema,
  insertVehicleSchema,
} from "../db/validation"

// drizzle-zod includes an optional `id` and `z.date()` timestamp fields on
// every insert schema (the latter can never pass a JSON body, since JSON has
// no Date type), so every route body schema omits them. Date-only columns
// (`date` in pg) come back as bare `z.string()` with no format check, so
// those are re-added with `z.iso.date()` to reject garbage before it reaches
// the DB.

export const idParam = z.coerce.number().int().positive()

export const searchQuery = z.object({ q: z.string().trim().min(2).max(100) })

const omitMeta = { id: true, createdAt: true, updatedAt: true } as const

export const createPersonBody = insertPersonSchema
  .omit(omitMeta)
  .extend({ dateOfBirth: z.iso.date() })
export const updatePersonBody = createPersonBody.partial()

export const createClientBody = insertClientSchema.omit(omitMeta).extend({
  phones: z.array(z.string().trim().min(1).max(20)).optional(),
  emails: z.array(z.email().max(255)).optional(),
})
export const updateClientBody = createClientBody.partial()

export const createPolicyBody = insertAutoPolicySchema
  .omit(omitMeta)
  .extend({ effectiveDate: z.iso.date(), expirationDate: z.iso.date() })
export const updatePolicyBody = createPolicyBody.partial()

export const createVehicleBody = insertVehicleSchema.omit(omitMeta)
export const updateVehicleBody = createVehicleBody.partial()

export const createCarrierBody = insertCarrierSchema.omit(omitMeta)
export const updateCarrierBody = createCarrierBody.partial()
