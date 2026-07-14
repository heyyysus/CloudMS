import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  createVehicle,
  deleteVehicle,
  findVehicleById,
  listVehicles,
  listVehiclesByPolicyId,
  updateVehicle,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createVehicleBody, idParam, updateVehicleBody } from "./schemas"

export const vehiclesRouter = Router()

vehiclesRouter.get("/vehicles", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.policyId === "string") {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json(await listVehiclesByPolicyId(policyId.data))
    return
  }
  res.json(await listVehicles())
})

vehiclesRouter.get("/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const vehicle = await findVehicleById(id)
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" })
    return
  }
  res.json(vehicle)
})

vehiclesRouter.post("/vehicles", requireAuth, async (req: Request, res: Response) => {
  const parsed = createVehicleBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }
  res.status(201).json(await createVehicle(parsed.data))
})

vehiclesRouter.patch("/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updateVehicleBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const vehicle = await updateVehicle(id, parsed.data)
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" })
    return
  }
  res.json(vehicle)
})

vehiclesRouter.delete("/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const deleted = await deleteVehicle(id)
  if (!deleted) {
    res.status(404).json({ error: "Vehicle not found" })
    return
  }
  res.status(204).send()
})
