import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { DemoDisabledError } from "../demo"
import { attachmentKeyPrefix, createPolicyAttachment } from "../repositories"
import { getPresignedDownloadUrl, headObject } from "../storage/r2"
import { makeSessionCookie, TestContext } from "./testHelpers"

// getPresignedDownloadUrl and headObject are mocked so tests don't need real
// R2 credentials; asserting on the download call's args is how these tests
// check the disposition/fileName plumbing without hitting R2, and stubbing
// the head lets /confirm run against an object that was never uploaded.
const HEAD = { sizeBytes: 100, contentType: "application/pdf" }

vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return {
    ...actual,
    getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://example.com/signed"),
    headObject: vi.fn(),
  }
})

const ctx = new TestContext()
const ORIGINAL_ENV = { ...process.env }
afterEach(() => {
  vi.mocked(getPresignedDownloadUrl).mockReset().mockResolvedValue("https://example.com/signed")
  vi.mocked(headObject).mockReset()
  process.env = { ...ORIGINAL_ENV }
  return ctx.cleanup()
})

describe("GET /policy-attachments/:id/link", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/policy-attachments/1/link")).status).toBe(401)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("attach-link-404")
    const cookie = await makeSessionCookie(user.id)

    expect(
      (await request(app).get("/policy-attachments/999999999/link").set("Cookie", cookie)).status
    ).toBe(404)
  })

  it("returns 400 for an invalid disposition", async () => {
    const user = await ctx.user("attach-link-baddisp")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const attachment = await createPolicyAttachment({
      policyId: policy.id,
      fileName: "test.pdf",
      storageKey: `policy-attachments/${policy.id}/test.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdBy: user.id,
    })

    const res = await request(app)
      .get(`/policy-attachments/${attachment.id}/link?disposition=bogus`)
      .set("Cookie", cookie)
    expect(res.status).toBe(400)
  })

  it("requests an inline URL by default, without a file name", async () => {
    const user = await ctx.user("attach-link-inline")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const attachment = await createPolicyAttachment({
      policyId: policy.id,
      fileName: "test.pdf",
      storageKey: `policy-attachments/${policy.id}/test.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdBy: user.id,
    })

    const res = await request(app)
      .get(`/policy-attachments/${attachment.id}/link`)
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.url).toBe("https://example.com/signed")
    expect(vi.mocked(getPresignedDownloadUrl)).toHaveBeenCalledWith(
      `policy-attachments/${policy.id}/test.pdf`,
      undefined
    )
  })

  it("passes the file name to force a download when disposition=attachment", async () => {
    const user = await ctx.user("attach-link-download")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const attachment = await createPolicyAttachment({
      policyId: policy.id,
      fileName: "declarations-page.pdf",
      storageKey: `policy-attachments/${policy.id}/declarations-page.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdBy: user.id,
    })

    const res = await request(app)
      .get(`/policy-attachments/${attachment.id}/link?disposition=attachment`)
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(vi.mocked(getPresignedDownloadUrl)).toHaveBeenCalledWith(
      `policy-attachments/${policy.id}/declarations-page.pdf`,
      { downloadFileName: "declarations-page.pdf" }
    )
  })

  // getPresignedDownloadUrl is mocked above, so this exercises the route's
  // own DemoDisabledError -> 403 mapping (handleStorageError) rather than the
  // real check in r2.ts's getClient() - that seam is covered by the presign
  // test below, which calls through to the unmocked function.
  it("returns 403 in demo mode", async () => {
    process.env.DEMO_MODE = "true"
    vi.mocked(getPresignedDownloadUrl).mockRejectedValueOnce(
      new DemoDisabledError("File storage is disabled in demo mode")
    )
    const user = await ctx.user("attach-link-demo")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const attachment = await createPolicyAttachment({
      policyId: policy.id,
      fileName: "test.pdf",
      storageKey: `policy-attachments/${policy.id}/test.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdBy: user.id,
    })

    const res = await request(app)
      .get(`/policy-attachments/${attachment.id}/link`)
      .set("Cookie", cookie)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe("Disabled in demo mode")
  })
})

describe("POST /policy-attachments/presign", () => {
  // getPresignedUploadUrl is not overridden by the vi.mock above, so this
  // exercises the real seam in storage/r2.ts's getClient() end to end - the
  // mocked R2 calls above cover the route wiring, this covers the check
  // itself fires before any credential is touched.
  it("returns 403 in demo mode, without touching R2 credentials", async () => {
    process.env.DEMO_MODE = "true"
    const user = await ctx.user("attach-presign-demo")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app).post("/policy-attachments/presign").set("Cookie", cookie).send({
      policyId: policy.id,
      fileName: "test.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe("Disabled in demo mode")
  })
})

describe("POST /policy-attachments/confirm", () => {
  // Presign already sanitizes the name it builds the storage key from, so
  // these cover the second use: the name persisted to the database.
  it("strips path separators and control characters from the stored file name", async () => {
    const user = await ctx.user("attach-confirm-sanitize")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    vi.mocked(headObject).mockResolvedValue(HEAD)

    const res = await request(app)
      .post("/policy-attachments/confirm")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        storageKey: `${attachmentKeyPrefix(policy.id)}uuid-decl.pdf`,
        fileName: "../../etc/passwd\u0007.pdf",
      })

    expect(res.status).toBe(201)
    expect(res.body.fileName).toBe(".._.._etc_passwd.pdf")
  })

  it("keeps an ordinary file name intact", async () => {
    const user = await ctx.user("attach-confirm-plain")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    vi.mocked(headObject).mockResolvedValue(HEAD)

    const res = await request(app)
      .post("/policy-attachments/confirm")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        storageKey: `${attachmentKeyPrefix(policy.id)}uuid-decl.pdf`,
        fileName: "declarations page (2026).pdf",
      })

    expect(res.status).toBe(201)
    expect(res.body.fileName).toBe("declarations page (2026).pdf")
  })

  // description isn't sanitized - a NUL byte there reaches Postgres, which
  // raises 22021. app.ts maps that to a 400 rather than letting it 500.
  it("returns 400 when a text field carries a NUL byte", async () => {
    const user = await ctx.user("attach-confirm-nul")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    vi.mocked(headObject).mockResolvedValue(HEAD)

    const res = await request(app)
      .post("/policy-attachments/confirm")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        storageKey: `${attachmentKeyPrefix(policy.id)}uuid-decl.pdf`,
        fileName: "decl.pdf",
        description: "before\u0000after",
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Invalid characters in request")
  })
})
