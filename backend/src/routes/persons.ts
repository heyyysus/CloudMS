import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createPerson,
  deletePerson,
  findPersonById,
  listPersons,
  updatePerson,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createPersonBody, updatePersonBody } from "./schemas"

export const personsRouter = Router()

personsRouter.get("/persons", requireAuth, async (_req: Request, res: Response) => {
  res.json(await listPersons())
})

personsRouter.get("/persons/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const person = await findPersonById(id)
  if (!person) {
    res.status(404).json({ error: "Person not found" })
    return
  }
  res.json(person)
})

personsRouter.post("/persons", requireAuth, async (req: Request, res: Response) => {
  const parsed = createPersonBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }
  res.status(201).json(await createPerson(parsed.data))
})

personsRouter.patch("/persons/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updatePersonBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const person = await updatePerson(id, parsed.data)
  if (!person) {
    res.status(404).json({ error: "Person not found" })
    return
  }
  res.json(person)
})

personsRouter.delete(
  "/persons/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const deleted = await deletePerson(id)
    if (!deleted) {
      res.status(404).json({ error: "Person not found" })
      return
    }
    res.status(204).send()
  }
)
