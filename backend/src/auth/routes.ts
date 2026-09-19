import { Request, Response, Router } from "express"
import { z } from "zod"
import {
  createSession,
  deleteSessionByTokenHash,
  findUserByEmail,
  updateUser,
} from "../repositories"
import type { User } from "../types"
import { verifyGoogleIdToken } from "./google"
import { SESSION_COOKIE, requireAuth } from "./middleware"
import { SESSION_TTL_MS, generateSessionToken, hashToken } from "./tokens"

const loginSchema = z.object({ idToken: z.string().min(1) })

function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const

export const authRouter = Router()

authRouter.post("/auth/google", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "idToken is required" })
    return
  }

  let identity
  try {
    identity = await verifyGoogleIdToken(parsed.data.idToken)
  } catch {
    res.status(401).json({ error: "Invalid Google token" })
    return
  }

  // Invite-only: the user row must already exist for this email.
  let user = await findUserByEmail(identity.email)
  if (!user || !user.isActive) {
    res.status(403).json({ error: "Account not authorized" })
    return
  }

  if (!user.googleSub) {
    user =
      (await updateUser(user.id, { googleSub: identity.sub, name: user.name ?? identity.name })) ??
      user
  } else if (user.googleSub !== identity.sub) {
    req.log.warn({ userId: user.id }, "Google sub mismatch for user email")
    res.status(403).json({ error: "Account not authorized" })
    return
  }

  const token = generateSessionToken()
  await createSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS })
  res.json({ user: publicUser(user) })
})

authRouter.post("/auth/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token === "string" && token !== "") {
    await deleteSessionByTokenHash(hashToken(token))
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions)
  res.json({ ok: true })
})

authRouter.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: publicUser(req.user!) })
})
