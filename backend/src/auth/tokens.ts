import { createHash, randomBytes } from "crypto"

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex")
}

// Only the hash is persisted, so a leaked sessions table can't be replayed.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
