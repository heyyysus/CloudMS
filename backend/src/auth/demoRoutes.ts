import { randomBytes } from "crypto"
import { Request, Response, Router } from "express"
import { z } from "zod"
import { demoSessionTtlMs } from "../config"
import { createSession, createUser } from "../repositories"
import { cookieOptions, publicUser } from "./routes"
import { SESSION_COOKIE } from "./middleware"
import { generateSessionToken, hashToken } from "./tokens"

const demoSignInBody = z.object({ name: z.string().trim().min(1).max(150) })

export const demoAuthRouter = Router()

demoAuthRouter.post("/auth/demo", async (req: Request, res: Response) => {
  const parsed = demoSignInBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "name is required" })
    return
  }

  const user = await createUser({
    name: parsed.data.name,
    email: `demo-${randomBytes(8).toString("hex")}@example.com`,
    role: "admin",
    isDemo: true,
  })

  const ttlMs = demoSessionTtlMs()
  const token = generateSessionToken()
  await createSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  })

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ttlMs })
  req.log.info({ userId: user.id }, "demo user signed in")
  res.json({ user: publicUser(user) })
})
