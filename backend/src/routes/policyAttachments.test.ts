import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { createPolicyAttachment } from "../repositories"
import { getPresignedDownloadUrl } from "../storage/r2"
import { makeSessionCookie, TestContext } from "./testHelpers"

// getPresignedDownloadUrl is mocked so tests don't need real R2 credentials;
// asserting on its call args is how these tests check the disposition/
// fileName plumbing without hitting R2.
vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return {
    ...actual,
    getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://example.com/signed"),
  }
})

const ctx = new TestContext()
afterEach(() => {
  vi.mocked(getPresignedDownloadUrl).mockReset().mockResolvedValue("https://example.com/signed")
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
})
