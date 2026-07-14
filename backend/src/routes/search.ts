import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import { searchClients, searchPolicies } from "../repositories"
import { firstIssue } from "./helpers"
import { searchQuery } from "./schemas"

export const searchRouter = Router()

searchRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  const parsed = searchQuery.safeParse({ q: req.query.q })
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }

  const [clients, policies] = await Promise.all([
    searchClients(parsed.data.q, 10),
    searchPolicies(parsed.data.q, 10),
  ])
  res.json({ clients, policies })
})
