import { randomUUID } from "node:crypto"
import express, { Request, Response, Router } from "express"
import { updateUser } from "../repositories"
import {
  deleteObject,
  getPresignedDownloadUrl,
  putObject,
  R2NotConfiguredError,
} from "../storage/r2"
import { requireSession } from "./middleware"
import { meResponse } from "./routes"

// Profile pictures live in the same R2 bucket as policy attachments, under
// their own prefix. The key is per user, not per org: a user is one row
// across every organization they belong to, and so is their picture.
export const AVATAR_KEY_PREFIX = "avatars/"
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

const EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// The Content-Type header is whatever the client claims; the object is
// stored (and later served) under the type its bytes actually are, so a
// renamed script can't be uploaded as a picture.
export function sniffImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png"
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "image/gif"
  return null
}

export function avatarKeyPrefix(userId: string): string {
  return `${AVATAR_KEY_PREFIX}${userId}/`
}

function isR2NotConfigured(err: unknown, res: Response): boolean {
  if (err instanceof R2NotConfiguredError) {
    res.status(503).json({ error: "File storage is not configured" })
    return true
  }
  return false
}

export const avatarRouter = Router()

// requireSession, not requireAuth, on both routes: the picture is shown in
// the org picker too, before a session is bound to an org.

// Redirects to wherever the picture currently is - a short-lived signed R2
// URL for an upload, Google's own URL otherwise - so the frontend has one
// stable `<img src>` and never holds a URL that can expire under it.
avatarRouter.get("/auth/avatar", requireSession, async (req: Request, res: Response) => {
  const user = req.user!
  let url: string
  if (user.avatarStorageKey) {
    try {
      url = await getPresignedDownloadUrl(user.avatarStorageKey)
    } catch (err) {
      if (isR2NotConfigured(err, res)) return
      throw err
    }
  } else if (user.avatarUrl) {
    url = user.avatarUrl
  } else {
    res.status(404).json({ error: "No profile picture" })
    return
  }
  res.redirect(302, url)
})

// The image bytes are the request body (not multipart, not presign+confirm
// like attachments): one request, size enforced here rather than trusted
// from a client-reported sizeBytes, and no orphaned object if the client
// gives up half way.
avatarRouter.put(
  "/auth/avatar",
  requireSession,
  express.raw({ type: "image/*", limit: AVATAR_MAX_BYTES }),
  async (req: Request, res: Response) => {
    const body: unknown = req.body
    const type = Buffer.isBuffer(body) ? sniffImageType(body) : null
    if (!Buffer.isBuffer(body) || !type) {
      res.status(400).json({ error: "Upload a JPEG, PNG, WebP or GIF image" })
      return
    }

    const user = req.user!
    const storageKey = `${avatarKeyPrefix(user.id)}${randomUUID()}.${EXTENSIONS[type]}`
    try {
      await putObject(storageKey, body, type)
    } catch (err) {
      if (isR2NotConfigured(err, res)) return
      throw err
    }

    const updated = (await updateUser(user.id, { avatarStorageKey: storageKey })) ?? user

    // Only once the row points at the new object: a failed delete leaves an
    // orphan in the bucket, which beats a row pointing at nothing.
    if (user.avatarStorageKey && user.avatarStorageKey !== storageKey) {
      try {
        await deleteObject(user.avatarStorageKey)
      } catch (err) {
        req.log.warn({ err, storageKey: user.avatarStorageKey }, "Could not delete old avatar")
      }
    }

    res.json(await meResponse(updated, req.session!))
  }
)
