import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { createMembership, createSession, findUserById, updateUser } from "../repositories"
import { TestContext } from "../routes/testHelpers"
import {
  deleteObject,
  getPresignedDownloadUrl,
  putObject,
  R2NotConfiguredError,
} from "../storage/r2"
import { AVATAR_MAX_BYTES, avatarKeyPrefix, sniffImageType } from "./avatar"
import { verifyGoogleIdToken } from "./google"
import { generateSessionToken, hashToken } from "./tokens"

vi.mock("./google", () => ({ verifyGoogleIdToken: vi.fn() }))

vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return {
    ...actual,
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://example.com/signed"),
  }
})

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])

const ctx = new TestContext()
afterEach(() => {
  vi.mocked(putObject).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteObject).mockReset().mockResolvedValue(undefined)
  vi.mocked(getPresignedDownloadUrl).mockReset().mockResolvedValue("https://example.com/signed")
  vi.mocked(verifyGoogleIdToken).mockReset()
  return ctx.cleanup()
})

describe("sniffImageType", () => {
  it("recognises the four accepted formats by their magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png")
    expect(sniffImageType(JPEG)).toBe("image/jpeg")
    expect(sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
    expect(sniffImageType(Buffer.from("GIF89a\0\0"))).toBe("image/gif")
  })

  it("rejects anything else, including an empty body", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull()
    expect(sniffImageType(Buffer.from("#!/bin/sh\n"))).toBeNull()
  })
})

describe("PUT /auth/avatar", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).put("/auth/avatar").set("Content-Type", "image/png").send(PNG)
    expect(res.status).toBe(401)
  })

  it("stores the image under the user's prefix and bumps avatarVersion", async () => {
    const user = await ctx.user("avatar-put")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(PNG)

    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(user.id)
    expect(res.body.user.avatarVersion).toEqual(expect.any(String))

    const [key, body, contentType] = vi.mocked(putObject).mock.calls[0]
    expect(key.startsWith(avatarKeyPrefix(user.id))).toBe(true)
    expect(key.endsWith(".png")).toBe(true)
    expect(Buffer.from(body).equals(PNG)).toBe(true)
    expect(contentType).toBe("image/png")
    expect((await findUserById(user.id))?.avatarStorageKey).toBe(key)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it("works on an org-less session", async () => {
    const user = await ctx.user("avatar-orgless")
    // ctx.cookie always binds an org; this is the session the org picker sees.
    const token = generateSessionToken()
    await createSession({
      userId: user.id,
      orgId: null,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    })

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", `session=${token}`)
      .set("Content-Type", "image/jpeg")
      .send(JPEG)
    expect(res.status).toBe(200)
    expect(res.body.org).toBeNull()
  })

  it("stores by sniffed type, not the declared one, and deletes the previous upload", async () => {
    const user = await ctx.user("avatar-replace")
    await updateUser(user.id, { avatarStorageKey: `${avatarKeyPrefix(user.id)}old.png` })
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(JPEG)

    expect(res.status).toBe(200)
    const [key, , contentType] = vi.mocked(putObject).mock.calls[0]
    expect(key.endsWith(".jpg")).toBe(true)
    expect(contentType).toBe("image/jpeg")
    expect(deleteObject).toHaveBeenCalledWith(`${avatarKeyPrefix(user.id)}old.png`)
  })

  it("still succeeds when deleting the previous upload fails", async () => {
    const user = await ctx.user("avatar-replace-fail")
    await updateUser(user.id, { avatarStorageKey: `${avatarKeyPrefix(user.id)}old.png` })
    vi.mocked(deleteObject).mockRejectedValue(new Error("r2 down"))
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(PNG)
    expect(res.status).toBe(200)
    expect((await findUserById(user.id))?.avatarStorageKey).not.toContain("old.png")
  })

  it("rejects bytes that are not an image with 400", async () => {
    const user = await ctx.user("avatar-notimage")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))
    expect(res.status).toBe(400)
    expect(putObject).not.toHaveBeenCalled()
  })

  it("rejects a non-image content type with 400", async () => {
    const user = await ctx.user("avatar-nottype")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .send({ hello: "world" })
    expect(res.status).toBe(400)
    expect(putObject).not.toHaveBeenCalled()
  })

  it("rejects an image over the size limit with 413", async () => {
    const user = await ctx.user("avatar-big")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(Buffer.concat([PNG, Buffer.alloc(AVATAR_MAX_BYTES)]))
    expect(res.status).toBe(413)
    expect(putObject).not.toHaveBeenCalled()
  })

  it("returns 503 when R2 is not configured", async () => {
    const user = await ctx.user("avatar-no-r2")
    vi.mocked(putObject).mockRejectedValue(new R2NotConfiguredError("unset"))
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .put("/auth/avatar")
      .set("Cookie", cookie)
      .set("Content-Type", "image/png")
      .send(PNG)
    expect(res.status).toBe(503)
    expect((await findUserById(user.id))?.avatarStorageKey).toBeNull()
  })
})

describe("GET /auth/avatar", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/auth/avatar")).status).toBe(401)
  })

  it("returns 404 when the user has no picture", async () => {
    const user = await ctx.user("avatar-get-none")
    const cookie = await ctx.cookie(user.id)
    expect((await request(app).get("/auth/avatar").set("Cookie", cookie)).status).toBe(404)
  })

  it("redirects to Google's picture when nothing was uploaded", async () => {
    const user = await ctx.user("avatar-get-google")
    await updateUser(user.id, { avatarUrl: "https://lh3.example/photo" })
    const cookie = await ctx.cookie(user.id)

    const res = await request(app).get("/auth/avatar").set("Cookie", cookie)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe("https://lh3.example/photo")
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled()
  })

  it("redirects to a signed URL for the upload, which wins over Google's picture", async () => {
    const user = await ctx.user("avatar-get-upload")
    const key = `${avatarKeyPrefix(user.id)}me.png`
    await updateUser(user.id, { avatarUrl: "https://lh3.example/photo", avatarStorageKey: key })
    const cookie = await ctx.cookie(user.id)

    const res = await request(app).get("/auth/avatar").set("Cookie", cookie)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe("https://example.com/signed")
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith(key)
  })

  it("returns 503 for an upload when R2 is not configured", async () => {
    const user = await ctx.user("avatar-get-no-r2")
    await updateUser(user.id, { avatarStorageKey: `${avatarKeyPrefix(user.id)}me.png` })
    vi.mocked(getPresignedDownloadUrl).mockRejectedValue(new R2NotConfiguredError("unset"))
    const cookie = await ctx.cookie(user.id)
    expect((await request(app).get("/auth/avatar").set("Cookie", cookie)).status).toBe(503)
  })
})

describe("POST /auth/google picture", () => {
  async function login(email: string, picture?: string) {
    vi.mocked(verifyGoogleIdToken).mockResolvedValue({ email, sub: `sub-${email}`, picture })
    return request(app).post("/auth/google").send({ idToken: "valid" })
  }

  it("records Google's picture on first login", async () => {
    const user = await ctx.user("avatar-login-first")
    const res = await login(user.email, "https://lh3.example/first")
    expect(res.status).toBe(200)
    expect(res.body.user.avatarVersion).toEqual(expect.any(String))
    expect((await findUserById(user.id))?.avatarUrl).toBe("https://lh3.example/first")
  })

  it("has no avatarVersion when Google sends no picture", async () => {
    const user = await ctx.user("avatar-login-nopic")
    const res = await login(user.email)
    expect(res.status).toBe(200)
    expect(res.body.user.avatarVersion).toBeNull()
  })

  it("refreshes a changed Google picture on a later login", async () => {
    const user = await ctx.user("avatar-login-refresh")
    await login(user.email, "https://lh3.example/first")
    await login(user.email, "https://lh3.example/second")
    expect((await findUserById(user.id))?.avatarUrl).toBe("https://lh3.example/second")
  })

  it("never overwrites once the user has uploaded their own", async () => {
    const user = await ctx.user("avatar-login-keep")
    await login(user.email, "https://lh3.example/first")
    await updateUser(user.id, { avatarStorageKey: `${avatarKeyPrefix(user.id)}me.png` })
    await login(user.email, "https://lh3.example/second")
    expect((await findUserById(user.id))?.avatarUrl).toBe("https://lh3.example/first")
  })

  it("is unaffected by a second membership", async () => {
    const user = await ctx.user("avatar-login-multi")
    await createMembership({ userId: user.id, orgId: (await ctx.org()).id, role: "staff" })
    const res = await login(user.email, "https://lh3.example/multi")
    expect(res.status).toBe(200)
    expect(res.body.org).toBeNull()
    expect(res.body.user.avatarVersion).toEqual(expect.any(String))
  })
})
