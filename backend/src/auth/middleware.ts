import { NextFunction, Request, Response } from "express"
import { findSessionWithUserByTokenHash } from "../repositories"
import type { UserRole } from "../types"
import { hashToken } from "./tokens"

export const SESSION_COOKIE = "session"

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== "string" || token === "") {
    res.status(401).json({ error: "Not authenticated" })
    return
  }

  const row = await findSessionWithUserByTokenHash(hashToken(token))
  if (!row || row.session.expiresAt < new Date()) {
    res.status(401).json({ error: "Not authenticated" })
    return
  }
  if (!row.user.isActive) {
    res.status(403).json({ error: "Account is disabled" })
    return
  }

  req.user = row.user
  next()
}

// Admins pass every role check.
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" })
      return
    }
    if (req.user.role !== role && req.user.role !== "admin") {
      res.status(403).json({ error: "Insufficient permissions" })
      return
    }
    next()
  }
}
