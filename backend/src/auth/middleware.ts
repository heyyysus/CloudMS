import { NextFunction, Request, Response } from "express"
import { runInOrg } from "../db"
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

  // Everything next() dispatches to - every downstream middleware and route
  // handler - runs on one transaction with app.org_id set, which is what
  // rls.ts's policies key off of (see db/context.ts's db proxy). The
  // transaction commits when the response is done, not when this middleware
  // returns: "close" fires once the response has finished sending, whether
  // that was a normal res.json() or the error handler's 500, and also fires
  // on an aborted connection - all three mean there is nothing left for this
  // request to do.
  await runInOrg(
    req.orgId,
    () =>
      new Promise<void>((resolve) => {
        res.on("close", resolve)
        next()
      })
  ).catch((err: unknown) => {
    // A pg error a handler lets escape aborts the transaction; Postgres
    // turns the COMMIT above into a no-op ROLLBACK without raising, so this
    // only fires for a genuine commit failure (lost connection, etc). The
    // response was already sent by the time COMMIT runs, so there is nothing
    // left to do but log it.
    req.log.error(err, "org-scoped request transaction failed to commit")
  })
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
