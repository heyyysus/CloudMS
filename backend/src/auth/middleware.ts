import { NextFunction, Request, Response } from "express"
import { findActiveMembership, findSessionWithUserByTokenHash } from "../repositories"
import type { Session, UserRole, User } from "../types"
import { hashToken } from "./tokens"

export const SESSION_COOKIE = "session"

// Shared cookie->session->user lookup for requireSession and requireAuth, so
// the two middlewares' 401/403 responses cannot drift apart. Writes the
// response itself and returns undefined on failure so callers can just
// `return` on a falsy result.
async function loadSession(
  req: Request,
  res: Response
): Promise<{ session: Session; user: User } | undefined> {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== "string" || token === "") {
    res.status(401).json({ error: "Not authenticated" })
    return undefined
  }

  const row = await findSessionWithUserByTokenHash(hashToken(token))
  if (!row || row.session.expiresAt < new Date()) {
    res.status(401).json({ error: "Not authenticated" })
    return undefined
  }
  if (!row.user.isActive) {
    res.status(403).json({ error: "Account is disabled" })
    return undefined
  }

  return row
}

// Authenticates the session but does not require an active org - only
// /auth/* routes use this, since the org picker (/auth/me, /auth/org) has to
// be reachable before a session is bound to one.
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const row = await loadSession(req, res)
  if (!row) return

  req.user = row.user
  req.session = row.session
  next()
}

// Authenticates the session and requires an active org membership. Every
// non-/auth route uses this, so "no route outside /auth/* is reachable
// without an active org" falls out of this one middleware.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const row = await loadSession(req, res)
  if (!row) return

  if (row.session.orgId === null) {
    res.status(403).json({ error: "No active organization", code: "ORG_REQUIRED" })
    return
  }

  // A membership revoked mid-session routes the user to the picker exactly
  // like an unbound session, rather than a stale pass-through.
  const membership = await findActiveMembership(row.user.id, row.session.orgId)
  if (!membership) {
    res.status(403).json({ error: "No active organization", code: "ORG_REQUIRED" })
    return
  }

  req.user = row.user
  req.session = row.session
  req.orgId = row.session.orgId
  req.membership = membership
  next()
}

// Admins pass every role check.
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      res.status(401).json({ error: "Not authenticated" })
      return
    }
    if (req.membership.role !== role && req.membership.role !== "admin") {
      res.status(403).json({ error: "Insufficient permissions" })
      return
    }
    next()
  }
}
