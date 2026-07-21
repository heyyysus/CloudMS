import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import { createPolicyLog, findAutoPolicyById, listPolicyLogsByPolicyId } from "../repositories"
import { firstIssue } from "./helpers"
import { createPolicyLogBody, idParam } from "./schemas"

export const policyLogsRouter = Router()

policyLogsRouter.get("/policy-logs", requireAuth, async (req: Request, res: Response) => {
  const policyId = idParam.safeParse(req.query.policyId)
  if (!policyId.success) {
    res.status(400).json({ error: "Invalid policyId" })
    return
  }
  res.json(await listPolicyLogsByPolicyId(policyId.data))
})

// Logs are append-only: no GET /policy-logs/:id, no PATCH, no DELETE.
policyLogsRouter.post("/policy-logs", requireAuth, async (req: Request, res: Response) => {
  const parsed = createPolicyLogBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const policy = await findAutoPolicyById(parsed.data.policyId)
  if (!policy) {
    res.status(404).json({ error: "Policy not found" })
    return
  }

  const log = await createPolicyLog({
    policyId: parsed.data.policyId,
    authorId: req.user!.id,
    body: parsed.data.body,
  })
  res.status(201).json(log)
})
