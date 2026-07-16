import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createAutoPolicyWithDetails,
  deleteAutoPolicy,
  getPolicyWithDetails,
  listAutoPolicies,
  listAutoPoliciesByClientId,
  PolicyWriteError,
  searchPolicies,
  updateAutoPolicyWithDetails,
} from "../repositories"
import { firstIssue, isPgForeignKeyViolation, isPgUniqueViolation, parseId } from "./helpers"
import { createPolicyBody, idParam, searchQuery, updatePolicyBody } from "./schemas"

export const policiesRouter = Router()

// Maps known write errors from create/update to a response; returns false
// when unrecognized so the caller can rethrow to the 500 handler.
function handlePolicyWriteError(err: unknown, res: Response): boolean {
  if (err instanceof PolicyWriteError) {
    res.status(400).json({ error: err.message })
    return true
  }
  if (isPgUniqueViolation(err, "auto_policies_policy_number_unique")) {
    res.status(409).json({ error: "Policy number already exists" })
    return true
  }
  if (isPgUniqueViolation(err, "vehicles_policy_id_vin_unique")) {
    res.status(409).json({ error: "Duplicate VIN on this policy" })
    return true
  }
  if (isPgForeignKeyViolation(err)) {
    res.status(400).json({ error: "Invalid client or carrier" })
    return true
  }
  return false
}

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

  try {
    res.status(201).json(await createAutoPolicyWithDetails(parsed.data))
  } catch (err) {
    if (!handlePolicyWriteError(err, res)) throw err
  }
})

policiesRouter.patch("/policies/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updatePolicyBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  try {
    const policy = await updateAutoPolicyWithDetails(id, parsed.data)
    if (!policy) {
      res.status(404).json({ error: "Policy not found" })
      return
    }
    res.json(policy)
  } catch (err) {
    if (!handlePolicyWriteError(err, res)) throw err
  }
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
