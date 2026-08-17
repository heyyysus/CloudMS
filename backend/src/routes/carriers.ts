import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createCarrier,
  deleteCarrier,
  findCarrierById,
  listCarriers,
  updateCarrier,
} from "../repositories"
import { firstIssue, isPgForeignKeyViolation, isPgUniqueViolation, parseId } from "./helpers"
import { createCarrierBody, updateCarrierBody } from "./schemas"

export const carriersRouter = Router()

const DUPLICATE_NAIC = "A carrier with this NAIC already exists"

// Reads stay open to every signed-in user - the policy forms need the carrier
// list to render their picker. Writes are admin-only: carriers are shared
// reference data that invoices and the trust ledger point at.

carriersRouter.get("/carriers", requireAuth, async (_req: Request, res: Response) => {
  res.json(await listCarriers())
})

carriersRouter.get("/carriers/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const carrier = await findCarrierById(id)
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" })
    return
  }
  res.json(carrier)
})

carriersRouter.post(
  "/carriers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = createCarrierBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    try {
      res.status(201).json(await createCarrier(parsed.data))
    } catch (err) {
      if (isPgUniqueViolation(err, "carriers_naic_unique")) {
        res.status(409).json({ error: DUPLICATE_NAIC })
        return
      }
      throw err
    }
  }
)

carriersRouter.patch(
  "/carriers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const parsed = updateCarrierBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    let carrier
    try {
      carrier = await updateCarrier(id, parsed.data)
    } catch (err) {
      if (isPgUniqueViolation(err, "carriers_naic_unique")) {
        res.status(409).json({ error: DUPLICATE_NAIC })
        return
      }
      throw err
    }

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" })
      return
    }
    res.json(carrier)
  }
)

carriersRouter.delete(
  "/carriers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    let deleted
    try {
      deleted = await deleteCarrier(id)
    } catch (err) {
      // Policies, invoice items, and trust ledger rows all point here with ON
      // DELETE no action. Deactivating is the intended way to retire a carrier.
      if (isPgForeignKeyViolation(err)) {
        res
          .status(409)
          .json({ error: "This carrier is referenced by existing policies or invoices" })
        return
      }
      throw err
    }

    if (!deleted) {
      res.status(404).json({ error: "Carrier not found" })
      return
    }
    res.status(204).send()
  }
)
