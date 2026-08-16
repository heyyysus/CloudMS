import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { buildPolicyChangeFormPdf, summarizePolicyChanges } from "../policyChangeSummary"
import {
  createAutoPolicyWithDetails,
  createPolicyLog,
  deleteAutoPolicy,
  getClientWithDetails,
  getPolicyWithDetails,
  listAutoPolicies,
  listAutoPoliciesByClientId,
  PolicyWriteError,
  searchPolicies,
  storeGeneratedPolicyAttachment,
  updateAutoPolicyWithDetails,
} from "../repositories"
import { firstIssue, isPgForeignKeyViolation, isPgUniqueViolation, parseId } from "./helpers"
import { createPolicyBody, idParam, searchQuery, updatePolicyBody } from "./schemas"

// Best-effort: the policy update has already committed by the time this
// runs, so nothing in here may throw - every failure (most commonly R2 being
// unconfigured, but also a bug in this code) is logged and swallowed rather
// than turning a successful policy update into a failed request.
async function recordPolicyChangeForm(
  req: Request,
  before: NonNullable<Awaited<ReturnType<typeof getPolicyWithDetails>>>,
  after: NonNullable<Awaited<ReturnType<typeof getPolicyWithDetails>>>,
  parsedInput: ReturnType<typeof updatePolicyBody.parse>,
  endorsementEffectiveDate: string | undefined
): Promise<void> {
  try {
    await recordPolicyChangeFormUnsafe(req, before, after, parsedInput, endorsementEffectiveDate)
  } catch (err) {
    req.log.error(err, "Failed to record policy change form")
  }
}

async function recordPolicyChangeFormUnsafe(
  req: Request,
  before: NonNullable<Awaited<ReturnType<typeof getPolicyWithDetails>>>,
  after: NonNullable<Awaited<ReturnType<typeof getPolicyWithDetails>>>,
  parsedInput: ReturnType<typeof updatePolicyBody.parse>,
  endorsementEffectiveDate: string | undefined
): Promise<void> {
  const changes = summarizePolicyChanges(before, after, parsedInput)
  if (changes.length === 0) return

  try {
    await createPolicyLog({
      policyId: after.id,
      authorId: req.user!.id,
      body: `Policy updated:\n- ${changes.join("\n- ")}`.slice(0, 5000),
    })
  } catch (err) {
    req.log.error(err, "Failed to write policy change log")
  }

  try {
    const client = await getClientWithDetails(after.clientId)
    const clientName = client
      ? `${client.namedInsured.firstName} ${client.namedInsured.lastName}`
      : "Unknown client"

    const pdf = await buildPolicyChangeFormPdf(
      {
        policy: after,
        clientName,
        editedBy: req.user!,
        editedAt: new Date(),
        // Falls back to today when the caller didn't send one, so the PDF
        // always has a value even if this route is ever hit without it.
        endorsementEffectiveDate: endorsementEffectiveDate ?? new Date().toISOString().slice(0, 10),
      },
      changes
    )
    await storeGeneratedPolicyAttachment({
      policyId: after.id,
      pdf,
      fileName: "Policy Change Form.pdf",
      keySlug: "policy-change-form",
      description: "Auto-generated summary of this edit",
      sourceType: "policy_change",
      sourceId: after.id,
      createdBy: req.user!.id,
    })
  } catch (err) {
    req.log.error(err, "Failed to generate policy change form attachment")
  }
}

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

  const before = await getPolicyWithDetails(id)
  if (!before) {
    res.status(404).json({ error: "Policy not found" })
    return
  }

  // Not a real policy column - it only feeds the generated change form/log
  // below, so it's kept out of the DB update.
  const { endorsementEffectiveDate, ...policyInput } = parsed.data

  try {
    const policy = await updateAutoPolicyWithDetails(id, policyInput)
    if (!policy) {
      res.status(404).json({ error: "Policy not found" })
      return
    }
    // Runs (and fully swallows its own errors - see recordPolicyChangeForm)
    // before responding, so the log/attachment it produces are guaranteed to
    // be visible to the caller's very next request.
    await recordPolicyChangeForm(req, before, policy, parsed.data, endorsementEffectiveDate)
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
