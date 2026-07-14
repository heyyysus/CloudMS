import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createAutoPolicy,
  deleteAutoPolicy,
  getPolicyWithDetails,
  listAutoPolicies,
  listAutoPoliciesByClientId,
  searchPolicies,
  updateAutoPolicy,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createPolicyBody, idParam, searchQuery, updatePolicyBody } from "./schemas"

export const policiesRouter = Router()

policiesRouter.get("/policies", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.q === "string" && req.query.q.length > 0) {
    const parsed = searchQuery.safeParse({ q: req.query.q })
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    res.json(await searchPolicies(parsed.data.q, 50))
    return
  }

  if (typeof req.query.clientId === "string") {
    const clientId = idParam.safeParse(req.query.clientId)
    if (!clientId.success) {
      res.status(400).json({ error: "Invalid clientId" })
      return
    }
    res.json(await listAutoPoliciesByClientId(clientId.data))
    return
  }

  res.json(await listAutoPolicies())
})

policiesRouter.get("/policies/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const policy = await getPolicyWithDetails(id)
  if (!policy) {
    res.status(404).json({ error: "Policy not found" })
    return
  }
  res.json(policy)
})

policiesRouter.post("/policies", requireAuth, async (req: Request, res: Response) => {
  const parsed = createPolicyBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }
  res.status(201).json(await createAutoPolicy(parsed.data))
})

policiesRouter.patch("/policies/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updatePolicyBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const policy = await updateAutoPolicy(id, parsed.data)
  if (!policy) {
    res.status(404).json({ error: "Policy not found" })
    return
  }
  res.json(policy)
})

policiesRouter.delete(
  "/policies/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const deleted = await deleteAutoPolicy(id)
    if (!deleted) {
      res.status(404).json({ error: "Policy not found" })
      return
    }
    res.status(204).send()
  }
)
