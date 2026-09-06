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
  // Always present in demo mode: the value is the reseed job's own interval,
  // which always resolves to a positive number, so there is no "unknown" case
  // to omit the field for.
  res.json({ demoMode: true, demoResetMinutes: demoResetMinutes() })
})
