import { NextFunction, Request, Response } from "express"
import { demoSignInLimitPerHour } from "../config"

const WINDOW_MS = 60 * 60 * 1000

interface Window {
  count: number
  windowStart: number
}

// Module-level, per-container, lost on restart - a speed bump against a
// script minting demo accounts in a loop, not a security control. `app.ts`
// has no `trust proxy` configured (and this does not add one globally, since
// that would also change request handling on the real instance), so the
// left-most X-Forwarded-For entry is read here directly. That header is
// trivially spoofable by anyone not behind the real proxy; treat this as
// best-effort only.
const windows = new Map<string, Window>()

function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const leftmost = first?.split(",")[0]?.trim()
  return leftmost || req.socket.remoteAddress || "unknown"
}

// Fixed-window counter keyed on the caller's IP: `limit` sign-ins per
// WINDOW_MS, then 429 until the window rolls. Only mounted on the demo
// router, which itself only exists when demoMode() (app.ts).
export function demoSignInLimit(req: Request, res: Response, next: NextFunction): void {
  const key = clientKey(req)
  const now = Date.now()
  const limit = demoSignInLimitPerHour()

  const existing = windows.get(key)
  const window =
    existing && now - existing.windowStart < WINDOW_MS ? existing : { count: 0, windowStart: now }

  if (window.count >= limit) {
    windows.set(key, window)
    res.status(429).json({ error: "Too many demo sign-ins from this address; try again later." })
    return
  }

  window.count += 1
  windows.set(key, window)
  next()
}
