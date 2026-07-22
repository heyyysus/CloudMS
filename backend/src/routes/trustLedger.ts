import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  getTrustBalanceByClientId,
  getTrustBalanceByPolicyId,
  listTrustLedgerByClientId,
  listTrustLedgerByPolicyId,
} from "../repositories"
import { idParam } from "./schemas"

export const trustLedgerRouter = Router()

// The agency trust-account ledger, filterable by clientId or policyId.
trustLedgerRouter.get("/trust-ledger", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.clientId === "string") {
    const clientId = idParam.safeParse(req.query.clientId)
    if (!clientId.success) {
      res.status(400).json({ error: "Invalid clientId" })
      return
    }
    res.json(await listTrustLedgerByClientId(clientId.data))
    return
  }
  if (typeof req.query.policyId === "string") {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json(await listTrustLedgerByPolicyId(policyId.data))
    return
  }
  res.status(400).json({ error: "Provide a clientId or policyId" })
})

// Trust balance (money in - money out) for a client or a policy.
trustLedgerRouter.get("/trust-balance", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.clientId === "string") {
    const clientId = idParam.safeParse(req.query.clientId)
    if (!clientId.success) {
      res.status(400).json({ error: "Invalid clientId" })
      return
    }
    res.json({ clientId: clientId.data, balance: await getTrustBalanceByClientId(clientId.data) })
    return
  }
  if (typeof req.query.policyId === "string") {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json({ policyId: policyId.data, balance: await getTrustBalanceByPolicyId(policyId.data) })
    return
  }
  res.status(400).json({ error: "Provide a clientId or policyId" })
})
