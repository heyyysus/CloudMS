import { and, eq, isNull } from "drizzle-orm"
import { centsToAmount, toCents } from "../../money"
import { createInvoiceWithDetails } from "../../repositories/invoices"
import { recordPayment } from "../../repositories/payments"
import { createPolicyLog } from "../../repositories/policyLogs"
import type { User } from "../../types"
import { db } from "../index"
import { invoiceItems, invoices, payments, policyLogs, receipts, trustLedger } from "../schema"
import type { SeededPolicy } from "./policies"
import { addDays, chunk, faker } from "./rng"

const NOTE_TEMPLATES = [
  "Called to confirm renewal details.",
  "Updated mailing address per client request.",
  "Left voicemail regarding outstanding balance.",
  "Verified driver's license on file.",
  "Client requested proof of insurance card.",
  "Reviewed coverage limits with client over the phone.",
  "Client called about a recent move.",
  "Confirmed garaging address with client.",
]

const PAYMENT_METHODS = ["cash", "check", "credit_card", "debit_card"] as const

function randomStaffId(staff: User[]): number {
  return faker.helpers.arrayElement(staff).id
}

async function backdateLog(logId: number, date: Date): Promise<void> {
  await db.update(policyLogs).set({ createdAt: date }).where(eq(policyLogs.id, logId))
}

async function addNote(policy: SeededPolicy, staff: User[], date: Date): Promise<void> {
  const log = await createPolicyLog({
    policyId: policy.id,
    authorId: randomStaffId(staff),
    body: faker.helpers.arrayElement(NOTE_TEMPLATES),
  })
  if (log) await backdateLog(log.id, date)
}

function premiumSweepAmount(): string {
  return centsToAmount(faker.number.int({ min: 40000, max: 250000 }))
}

function agencyFeeAmount(): string {
  return centsToAmount(faker.number.int({ min: 2500, max: 15000 }))
}

async function createInvoiceAt(
  policy: SeededPolicy,
  staff: User[],
  date: Date,
  sweepType: "new_business_sweep" | "installment_payment_sweep",
  feeType: "new_business_fee" | "installment_payment_fee"
): Promise<{ id: number; total: string } | null> {
  const result = await createInvoiceWithDetails({
    policyId: policy.id,
    createdBy: randomStaffId(staff),
    items: [
      { category: "sweep", type: sweepType, amount: premiumSweepAmount() },
      { category: "agency", type: feeType, amount: agencyFeeAmount() },
    ],
  })
  if (!result) return null

  await db
    .update(invoices)
    .set({ createdAt: date, updatedAt: date })
    .where(eq(invoices.id, result.invoice.id))
  await db
    .update(invoiceItems)
    .set({ createdAt: date })
    .where(eq(invoiceItems.invoiceId, result.invoice.id))
  await backdateLog(result.logId, date)

  return { id: result.invoice.id, total: result.invoice.total }
}

async function recordPaymentAt(
  invoiceId: number,
  staff: User[],
  date: Date,
  amount: string
): Promise<boolean> {
  const result = await recordPayment({
    invoiceId,
    method: faker.helpers.arrayElement(PAYMENT_METHODS),
    amount,
    createdBy: randomStaffId(staff),
  })
  if (result.status !== "ok") return false
  const { receiptId, logId } = result

  const [receiptRow] = await db
    .select({ paymentId: receipts.paymentId })
    .from(receipts)
    .where(eq(receipts.id, receiptId))

  await db.update(payments).set({ createdAt: date }).where(eq(payments.id, receiptRow.paymentId))
  await db.update(receipts).set({ createdAt: date }).where(eq(receipts.id, receiptId))
  await db
    .update(trustLedger)
    .set({ createdAt: date })
    .where(eq(trustLedger.paymentId, receiptRow.paymentId))
  await backdateLog(logId, date)

  const [invoiceRow] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
  await db.update(invoices).set({ updatedAt: date }).where(eq(invoices.id, invoiceId))
  if (invoiceRow.status === "closed") {
    await db
      .update(trustLedger)
      .set({ createdAt: date })
      .where(and(eq(trustLedger.invoiceId, invoiceId), isNull(trustLedger.paymentId)))
  }

  return true
}

async function payDownInvoice(
  invoiceId: number,
  total: string,
  staff: User[],
  startDate: Date,
  now: Date
): Promise<void> {
  const paymentCount = faker.helpers.weightedArrayElement([
    { value: 0, weight: 10 },
    { value: 1, weight: 60 },
    { value: 2, weight: 20 },
    { value: 3, weight: 10 },
  ])
  if (paymentCount === 0) return

  let remainingC = toCents(total)
  let cursor = startDate
  for (let i = 0; i < paymentCount && remainingC > 0; i++) {
    cursor = addDays(cursor, faker.number.int({ min: 1, max: 15 }))
    if (cursor > now) cursor = now

    const isLast = i === paymentCount - 1
    const fullyPay = isLast && faker.datatype.boolean({ probability: 0.8 })
    const appliedC = Math.min(
      fullyPay ? remainingC : Math.round(remainingC * faker.number.float({ min: 0.3, max: 0.7 })),
      remainingC
    )
    const overpayC = faker.datatype.boolean({ probability: 0.08 })
      ? faker.number.int({ min: 100, max: 2000 })
      : 0

    const ok = await recordPaymentAt(invoiceId, staff, cursor, centsToAmount(appliedC + overpayC))
    if (!ok) break
    remainingC -= appliedC
  }
}

export async function seedFinancials(policies: SeededPolicy[], staff: User[]): Promise<void> {
  const now = new Date()

  for (const batch of chunk(policies, 8)) {
    await Promise.all(
      batch.map(async (policy) => {
        const effectiveDate = new Date(policy.effectiveDate)
        if (effectiveDate > now) {
          await addNote(
            policy,
            staff,
            addDays(effectiveDate, -faker.number.int({ min: 3, max: 14 }))
          )
          return
        }

        await addNote(policy, staff, addDays(effectiveDate, faker.number.int({ min: 0, max: 2 })))

        let cursor = addDays(effectiveDate, faker.number.int({ min: 1, max: 5 }))
        if (cursor > now) cursor = now
        const invoice = await createInvoiceAt(
          policy,
          staff,
          cursor,
          "new_business_sweep",
          "new_business_fee"
        )
        if (invoice) {
          await payDownInvoice(invoice.id, invoice.total, staff, cursor, now)
        }

        const expirationDate = new Date(policy.expirationDate)
        const midTerm = addDays(
          effectiveDate,
          Math.round((expirationDate.getTime() - effectiveDate.getTime()) / (2 * 86400000))
        )
        if (midTerm < now && midTerm > cursor && faker.datatype.boolean({ probability: 0.3 })) {
          const installment = await createInvoiceAt(
            policy,
            staff,
            midTerm,
            "installment_payment_sweep",
            "installment_payment_fee"
          )
          if (installment) {
            await payDownInvoice(installment.id, installment.total, staff, midTerm, now)
          }
        }

        if (faker.datatype.boolean({ probability: 0.4 })) {
          const noteDate = addDays(cursor, faker.number.int({ min: 5, max: 60 }))
          await addNote(policy, staff, noteDate > now ? now : noteDate)
        }
      })
    )
  }
}
