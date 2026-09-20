import { Request, Response, Router } from "express"
import { z } from "zod"
import {
  createSession,
  deleteSessionByTokenHash,
  findActiveMembership,
  findOrganizationById,
  findUserByEmail,
  listActiveMembershipsWithOrg,
  setSessionOrg,
  updateUser,
  type ActiveMembershipWithOrg,
} from "../repositories"
import { setActiveOrgBody } from "../routes/schemas"
import type { Session, User } from "../types"
import { verifyGoogleIdToken } from "./google"
import { SESSION_COOKIE, requireSession } from "./middleware"
import { SESSION_TTL_MS, generateSessionToken, hashToken } from "./tokens"

const loginSchema = z.object({ idToken: z.string().min(1) })

function publicUser(user: User, role: string | null) {
  return { id: user.id, email: user.email, name: user.name, role }
}

// The `{ user, org, memberships }` shape every auth route returns: a
// superset of the old `{ user }` payload, and what the (future) org picker
// needs. Factored into one helper so the three routes can't drift.
async function meResponse(user: User, session: Session) {
  const memberships = await listActiveMembershipsWithOrg(user.id)
  const org = session.orgId === null ? null : await findOrganizationById(session.orgId)
  const role = memberships.find((m: ActiveMembershipWithOrg) => m.orgId === session.orgId)?.role ?? null
  return {
    user: publicUser(user, role),
    org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    memberships,
  }
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

  const memberships = await listActiveMembershipsWithOrg(user.id)
  // Same message as the no-user case above - the endpoint must not leak
  // whether the address exists but has no active membership.
  if (memberships.length === 0) {
    res.status(403).json({ error: "Account not authorized" })
    return
  }

  const token = generateSessionToken()
  const session = await createSession({
    userId: user.id,
    orgId: memberships.length === 1 ? memberships[0].orgId : null,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS })
  res.json(await meResponse(user, session))
})

authRouter.post("/auth/org", requireSession, async (req: Request, res: Response) => {
  const parsed = setActiveOrgBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "orgId is required" })
    return
  }

  const membership = await findActiveMembership(req.user!.id, parsed.data.orgId)
  if (!membership) {
    res.status(403).json({ error: "Not a member of that organization" })
    return
  }

  const session = await setSessionOrg(req.session!.id, parsed.data.orgId)
  res.json(await meResponse(req.user!, session!))
})

authRouter.post("/auth/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token === "string" && token !== "") {
    await deleteSessionByTokenHash(hashToken(token))
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions)
  res.json({ ok: true })
})

// requireSession, not requireAuth: the picker has to be able to read this
// with no org bound yet.
authRouter.get("/auth/me", requireSession, async (req: Request, res: Response) => {
  res.json(await meResponse(req.user!, req.session!))
})
