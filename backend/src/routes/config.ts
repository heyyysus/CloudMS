import { Response, Router } from "express"
import { demoMode } from "../config"

export const configRouter = Router()

// Unauthenticated and public even on a real production instance - it must
// answer before any frontend knows whether to show the demo sign-in path.
configRouter.get("/config", (_req, res: Response) => {
  res.json({ demoMode: demoMode() })
})
