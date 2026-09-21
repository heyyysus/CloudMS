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
  // rls.ts's policies key off of (see db/context.ts's db proxy). The actual
  // socket write is held back until that transaction commits: res.end is
  // every response method's (json/send/status().json()/the error handler's
  // 500) common final call, so intercepting it here lets the handler run to
  // completion, captures what it tried to send, and only hands that to the
  // real res.end once COMMIT has returned. Without this, a client that
  // receives its response and immediately issues a second request (exactly
  // what a UI does after a create, and what the test suite does constantly)
  // can have that second request's transaction start before the first one's
  // COMMIT lands, and under READ COMMITTED it then reads its own prior write
  // as missing - not a hypothetical, it showed up as real cross-request
  // flakiness (a void wrongly succeeding because the payment that should
  // have blocked it wasn't committed yet) once RLS made every request wait
  // on a real transaction. Held back rather than committing early: an
  // aborted connection (res.end never called) still resolves via "close" so
  // the transaction is never left open.
  const originalEnd = res.end.bind(res)
  let flush: (() => ReturnType<typeof originalEnd>) | undefined
  await runInOrg(
    req.orgId,
    () =>
      new Promise<void>((resolve) => {
        res.end = ((...args: Parameters<typeof res.end>) => {
          flush = () => originalEnd(...args)
          resolve()
          return res
        }) as typeof res.end
        res.once("close", resolve)
        next()
      })
  )
    .then(() => {
      // Only reached once COMMIT has returned - fn() resolving just lets the
      // transaction callback finish, it does not by itself mean the write
      // landed. flush() is what actually puts bytes on the wire.
      res.end = originalEnd
      flush?.()
    })
    .catch((err: unknown) => {
      // A pg error a handler lets escape aborts the transaction; Postgres
      // turns the COMMIT above into a no-op ROLLBACK without raising, so this
      // only fires for a genuine commit failure (lost connection, etc).
      // Nothing was flushed to the client in that case, which is the correct
      // failure mode - better a hung connection Express's own timeout closes
      // than a 200 for a write that never landed.
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
