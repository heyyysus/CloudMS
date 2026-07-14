import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createCarrier,
  deleteCarrier,
  findCarrierById,
  listCarriers,
  updateCarrier,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createCarrierBody, updateCarrierBody } from "./schemas"

export const carriersRouter = Router()

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

carriersRouter.post("/carriers", requireAuth, async (req: Request, res: Response) => {
  const parsed = createCarrierBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }
  res.status(201).json(await createCarrier(parsed.data))
})

carriersRouter.patch("/carriers/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updateCarrierBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const carrier = await updateCarrier(id, parsed.data)
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" })
    return
  }
  res.json(carrier)
})

carriersRouter.delete(
  "/carriers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const deleted = await deleteCarrier(id)
    if (!deleted) {
      res.status(404).json({ error: "Carrier not found" })
      return
    }
    res.status(204).send()
  }
)
