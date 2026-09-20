import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createClient,
  deleteClient,
  findClientById,
  getClientWithDetails,
  listClients,
  replaceClientEmails,
  replaceClientPhones,
  searchClients,
  updateClient,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createClientBody, searchQuery, updateClientBody } from "./schemas"

export const clientsRouter = Router()

clientsRouter.get("/clients", requireAuth, async (req: Request, res: Response) => {
  if (typeof req.query.q === "string" && req.query.q.length > 0) {
    const parsed = searchQuery.safeParse({ q: req.query.q })
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    res.json(await searchClients(req.orgId!, parsed.data.q, 50))
    return
  }
  res.json(await listClients(req.orgId!))
})

clientsRouter.get("/clients/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const client = await getClientWithDetails(req.orgId!, id)
  if (!client) {
    res.status(404).json({ error: "Client not found" })
    return
  }
  res.json(client)
})

clientsRouter.post("/clients", requireAuth, async (req: Request, res: Response) => {
  const parsed = createClientBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const { phones, emails, ...clientInput } = parsed.data
  const client = await createClient(req.orgId!, clientInput)
  if (phones) await replaceClientPhones(req.orgId!, client.id, phones)
  if (emails) await replaceClientEmails(req.orgId!, client.id, emails)

  res.status(201).json(await getClientWithDetails(req.orgId!, client.id))
})

clientsRouter.patch("/clients/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseId(req.params.id, res)
  if (id === undefined) return

  const parsed = updateClientBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const existing = await findClientById(req.orgId!, id)
  if (!existing) {
    res.status(404).json({ error: "Client not found" })
    return
  }

  const { phones, emails, ...clientInput } = parsed.data
  if (Object.keys(clientInput).length > 0) await updateClient(req.orgId!, id, clientInput)
  if (phones !== undefined) await replaceClientPhones(req.orgId!, id, phones)
  if (emails !== undefined) await replaceClientEmails(req.orgId!, id, emails)

  res.json(await getClientWithDetails(req.orgId!, id))
})

clientsRouter.delete(
  "/clients/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const deleted = await deleteClient(req.orgId!, id)
    if (!deleted) {
      res.status(404).json({ error: "Client not found" })
      return
    }
    res.status(204).send()
  }
)
