import { z } from "zod"
import {
  driverRatingEnum,
  invoiceItemCategoryEnum,
  invoiceItemTypeEnum,
  paymentMethodEnum,
} from "../db/schema"
import {
  insertAutoPolicySchema,
  insertCarrierSchema,
  insertClientSchema,
  insertPersonSchema,
  insertPolicyLogSchema,
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

// Address state/zip columns come back from drizzle-zod as bare nullable
// strings; re-tighten them here so bad values are rejected before the DB.
const stateCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "State must be a 2-letter code")
  .nullable()
  .optional()

const zipCode = z
  .string()
  .trim()
  .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP")
  .nullable()
  .optional()

export const createPersonBody = insertPersonSchema
  .omit(omitMeta)
  .extend({ dateOfBirth: z.iso.date() })
export const updatePersonBody = createPersonBody.partial()

export const createClientBody = insertClientSchema.omit(omitMeta).extend({
  mailingState: stateCode,
  mailingZip: zipCode,
  physicalState: stateCode,
  physicalZip: zipCode,
  phones: z.array(z.string().trim().min(1).max(20)).optional(),
  emails: z.array(z.email().max(255)).optional(),
})
export const updateClientBody = createClientBody.partial()

const policyCoreBody = insertAutoPolicySchema.omit(omitMeta).extend({
  effectiveDate: z.iso.date(),
  expirationDate: z.iso.date(),
  policyState: stateCode,
  policyZip: zipCode,
})

// Nested create: vehicles get policyId injected server-side; a driver either
// references an existing person (reusing their drivers row when one exists)
// or creates a new person + driver in the same transaction.
export const createPolicyVehicle = insertVehicleSchema.omit({
  ...omitMeta,
  policyId: true,
})

// dlNumber is optional on both branches — an agency may not have it yet
// (e.g. a prospect client), so drivers can be recorded without one.
export const createPolicyDriver = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    personId: z.number().int().positive(),
    dlNumber: z.string().trim().min(1).max(50).optional(),
    rating: z.enum(driverRatingEnum.enumValues).optional(),
    sr22: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("new"),
    person: createPersonBody,
    dlNumber: z.string().trim().min(1).max(50).optional(),
    rating: z.enum(driverRatingEnum.enumValues).default("rated"),
    sr22: z.boolean().default(false),
  }),
])

const policyChildren = {
  vehicles: z.array(createPolicyVehicle).optional(),
  drivers: z.array(createPolicyDriver).optional(),
}

function checkPolicyChildren(
  body: {
    vehicles?: z.infer<typeof createPolicyVehicle>[]
    drivers?: z.infer<typeof createPolicyDriver>[]
  },
  ctx: z.RefinementCtx
) {
  const vins = new Set<string>()
  body.vehicles?.forEach((vehicle, i) => {
    if (vins.has(vehicle.vin)) {
      ctx.addIssue({
        code: "custom",
        path: ["vehicles", i, "vin"],
        message: `Duplicate VIN in payload: ${vehicle.vin}`,
      })
    }
    vins.add(vehicle.vin)
  })
  const personIds = new Set<number>()
  body.drivers?.forEach((driver, i) => {
    if (driver.kind !== "existing") return
    if (personIds.has(driver.personId)) {
      ctx.addIssue({
        code: "custom",
        path: ["drivers", i, "personId"],
        message: `Duplicate driver personId in payload: ${driver.personId}`,
      })
    }
    personIds.add(driver.personId)
  })
}

export const createPolicyBody = policyCoreBody
  .extend(policyChildren)
  .superRefine(checkPolicyChildren)

// Partial like other update bodies, but vehicles/drivers are replace-all: key
// absent leaves that collection untouched, [] clears it, [...] replaces it.
export const updatePolicyBody = policyCoreBody
  .partial()
  .extend(policyChildren)
  .superRefine(checkPolicyChildren)

export const createVehicleBody = insertVehicleSchema.omit(omitMeta)
export const updateVehicleBody = createVehicleBody.partial()

// logNumber and authorId are assigned server-side (a per-policy counter and
// the session user), never accepted from the client. Logs are immutable, so
// there is no update body.
export const createPolicyLogBody = insertPolicyLogSchema
  .omit({ id: true, createdAt: true, logNumber: true, authorId: true })
  .extend({
    policyId: z.number().int().positive(),
    body: z.string().trim().min(1).max(5000),
  })

export const createCarrierBody = insertCarrierSchema.omit(omitMeta)
export const updateCarrierBody = createCarrierBody.partial()

// Money arrives as a JSON number or a decimal string; normalize to a
// 2-decimal string for the numeric(12,2) columns. `positiveMoney` rejects 0
// and negatives.
const positiveMoney = z.union([z.number(), z.string().trim().min(1)]).transform((value, ctx) => {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    ctx.addIssue({ code: "custom", message: "Must be a positive amount" })
    return z.NEVER
  }
  return n.toFixed(2)
})

const SWEEP_TYPES: readonly string[] = [
  "new_business_sweep",
  "installment_payment_sweep",
  "endorsement_sweep",
]

// A line item's type fixes its category and whether a carrier is allowed:
// sweep types must be category "sweep" (money to a carrier); fee types must be
// category "agency" (money to the agency, no carrier). The carrier on a sweep
// item is optional here - the repository defaults it to the policy's carrier.
export const createInvoiceItemBody = z
  .object({
    category: z.enum(invoiceItemCategoryEnum.enumValues),
    type: z.enum(invoiceItemTypeEnum.enumValues),
    carrierId: z.number().int().positive().nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    amount: positiveMoney,
  })
  .superRefine((item, ctx) => {
    const isSweep = SWEEP_TYPES.includes(item.type)
    if (isSweep && item.category !== "sweep") {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Sweep types require category 'sweep'",
      })
    }
    if (!isSweep && item.category !== "agency") {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Fee types require category 'agency'",
      })
    }
    if (!isSweep && item.carrierId != null) {
      ctx.addIssue({
        code: "custom",
        path: ["carrierId"],
        message: "Agency fee items must not have a carrier",
      })
    }
  })

export const createInvoiceBody = z.object({
  policyId: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
  items: z.array(createInvoiceItemBody).min(1),
})

export const recordPaymentBody = z.object({
  invoiceId: z.number().int().positive(),
  method: z.enum(paymentMethodEnum.enumValues),
  amount: positiveMoney,
  note: z.string().trim().max(2000).nullable().optional(),
  receiptNote: z.string().trim().max(2000).nullable().optional(),
})

export const voidBody = z.object({
  reason: z.string().trim().max(2000).nullable().optional(),
})
