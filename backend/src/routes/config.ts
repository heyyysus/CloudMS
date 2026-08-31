import { Response, Router } from "express"
import { demoMode, demoResetMinutes } from "../config"

export const configRouter = Router()

// Unauthenticated and public even on a real production instance - it must
// answer before any frontend knows whether to show the demo sign-in path.
// Non-demo body is kept byte-identical to before this field existed:
// config.test.ts asserts the exact body real instances have depended on.
configRouter.get("/config", (_req, res: Response) => {
  if (!demoMode()) {
    res.json({ demoMode: false })
    return
  }
  const resetMinutes = demoResetMinutes()
  res.json({
    demoMode: true,
    ...(resetMinutes > 0 ? { demoResetMinutes: resetMinutes } : {}),
  })
})
