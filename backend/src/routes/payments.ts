import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  getPaymentWithDetails,
  getReceiptWithDetails,
  listPaymentsByClientId,
  listPaymentsByPolicyId,
  recordPayment,
  voidPayment,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { idParam, recordPaymentBody, voidBody } from "./schemas"

export const paymentsRouter = Router()

paymentsRouter.get("/payments", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.clientId === "string") {
    const clientId = idParam.safeParse(req.query.clientId)
    if (!clientId.success) {
      res.status(400).json({ error: "Invalid clientId" })
      return
    }
    res.json(await listPaymentsByClientId(clientId.data))
    return
  }
  if (typeof req.query.policyId === "string") {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json(await listPaymentsByPolicyId(policyId.data))
    return
  }
  res.status(400).json({ error: "Provide a clientId or policyId" })
})

paymentsRouter.get("/payments/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const payment = await getPaymentWithDetails(id)
  if (!payment) {
    res.status(404).json({ error: "Payment not found" })
    return
  }
  res.json(payment)
})

// Records a payment against an open invoice and returns the receipt it mints.
paymentsRouter.post("/payments", requireAuth, async (req: Request, res: Response) => {
  const parsed = recordPaymentBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const result = await recordPayment({
    invoiceId: parsed.data.invoiceId,
    method: parsed.data.method,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    receiptNote: parsed.data.receiptNote ?? null,
    createdBy: req.user!.id,
  })

  switch (result.status) {
    case "invoice_not_found":
      res.status(404).json({ error: "Invoice not found" })
      return
    case "invoice_not_open":
      res.status(409).json({ error: "Invoice is not open for payment" })
      return
    case "ok":
      res.status(201).json(await getReceiptWithDetails(result.receiptId))
      return
  }
})

// Payments are immutable: no PATCH/DELETE. A mistaken payment is voided, which
// reverses its trust-ledger movements and reopens the invoice.
paymentsRouter.post("/payments/:id/void", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = voidBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const result = await voidPayment(id, req.user!.id, parsed.data.reason ?? null)
  switch (result.status) {
    case "not_found":
      res.status(404).json({ error: "Payment not found" })
      return
    case "already_void":
      res.status(409).json({ error: "Payment is already void" })
      return
    case "ok":
      res.json(await getPaymentWithDetails(id))
      return
  }
})
