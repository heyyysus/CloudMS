import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  createInvoiceWithDetails,
  getInvoiceWithDetails,
  InvoiceWriteError,
  listInvoicesByClientId,
  listInvoicesByPolicyId,
  voidInvoice,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createInvoiceBody, idParam, voidBody } from "./schemas"

export const invoicesRouter = Router()

// List by clientId or policyId (both are supported so accounting records are
// reachable with just a client id, per spec). Exactly one is required.
invoicesRouter.get("/invoices", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.clientId === "string") {
    const clientId = idParam.safeParse(req.query.clientId)
    if (!clientId.success) {
      res.status(400).json({ error: "Invalid clientId" })
      return
    }
    res.json(await listInvoicesByClientId(clientId.data))
    return
  }
  if (typeof req.query.policyId === "string") {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json(await listInvoicesByPolicyId(policyId.data))
    return
  }
  res.status(400).json({ error: "Provide a clientId or policyId" })
})

invoicesRouter.get("/invoices/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const invoice = await getInvoiceWithDetails(id)
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" })
    return
  }
  res.json(invoice)
})

invoicesRouter.post("/invoices", requireAuth, async (req: Request, res: Response) => {
  const parsed = createInvoiceBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  try {
    const invoice = await createInvoiceWithDetails({
      policyId: parsed.data.policyId,
      note: parsed.data.note ?? null,
      items: parsed.data.items,
      createdBy: req.user!.id,
    })
    if (!invoice) {
      res.status(404).json({ error: "Policy not found" })
      return
    }
    res.status(201).json(invoice)
  } catch (err) {
    if (err instanceof InvoiceWriteError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

// Invoices are immutable: there is no PATCH. A mistaken invoice is voided
// (only while it has no active payments).
invoicesRouter.post("/invoices/:id/void", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = voidBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const result = await voidInvoice(id, req.user!.id, parsed.data.reason ?? null)
  switch (result.status) {
    case "not_found":
      res.status(404).json({ error: "Invoice not found" })
      return
    case "already_void":
      res.status(409).json({ error: "Invoice is already void" })
      return
    case "has_active_payments":
      res.status(409).json({ error: "Void the invoice's payments before voiding the invoice" })
      return
    case "ok":
      res.json(await getInvoiceWithDetails(id))
      return
  }
})
