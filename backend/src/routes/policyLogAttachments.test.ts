import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { createPolicyAttachment, storeGeneratedPolicyAttachment } from "../repositories"
import { putObject } from "../storage/r2"
import { makeSessionCookie, TestContext } from "./testHelpers"

// The auto-link tests at the bottom create invoices and payments, which upload
// generated PDFs. Mocked so tests don't need real R2 credentials.
vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return { ...actual, putObject: vi.fn().mockResolvedValue(undefined) }
})

const ctx = new TestContext()
afterEach(() => {
  vi.mocked(putObject).mockReset().mockResolvedValue(undefined)
  return ctx.cleanup()
})

let fileCounter = 0
async function makeAttachment(policyId: number, createdBy: number) {
  fileCounter += 1
  return createPolicyAttachment({
    policyId,
    fileName: `doc-${fileCounter}.pdf`,
    storageKey: `policy-attachments/${policyId}/${Date.now()}-${fileCounter}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    createdBy,
  })
}

interface LinkRow {
  id: number
  logId: number
  linkedBy: { id: number; name: string | null; email: string }
  attachment: { id: number; fileName: string; isVoided: boolean; sourceType: string }
}

async function links(policyId: number, cookie: string): Promise<LinkRow[]> {
  const res = await request(app)
    .get(`/policy-log-attachments?policyId=${policyId}`)
    .set("Cookie", cookie)
  expect(res.status).toBe(200)
  return res.body
}

describe("GET /policy-log-attachments", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/policy-log-attachments?policyId=1")).status).toBe(401)
  })

  it("returns 400 without a valid policyId", async () => {
    const user = await ctx.user("logatt-badquery")
    const cookie = await makeSessionCookie(user.id)
    expect(
      (await request(app).get("/policy-log-attachments?policyId=abc").set("Cookie", cookie)).status
    ).toBe(400)
  })

  it("returns an empty list for a policy with no links", async () => {
    const user = await ctx.user("logatt-empty")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    expect(await links(policy.id, cookie)).toEqual([])
  })
})

describe("POST /policy-log-attachments", () => {
  it("links several attachments to one log and credits the linker", async () => {
    const user = await ctx.user("logatt-create")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)
    const a = await makeAttachment(policy.id, user.id)
    const b = await makeAttachment(policy.id, user.id)

    const res = await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", cookie)
      .send({ logId: log.id, attachmentIds: [a.id, b.id] })
    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2)

    const rows = await links(policy.id, cookie)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.logId === log.id)).toBe(true)
    expect(rows.every((row) => row.linkedBy.id === user.id)).toBe(true)
    expect(rows.map((row) => row.attachment.id).sort()).toEqual([a.id, b.id].sort())
  })

  it("never exposes the storage key", async () => {
    const user = await ctx.user("logatt-nokey")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)
    const a = await makeAttachment(policy.id, user.id)

    await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", cookie)
      .send({ logId: log.id, attachmentIds: [a.id] })

    const rows = await links(policy.id, cookie)
    expect(rows[0].attachment).not.toHaveProperty("storageKey")
  })

  it("credits the user who linked, not the one who uploaded", async () => {
    const uploader = await ctx.user("logatt-uploader")
    const linker = await ctx.user("logatt-linker")
    const linkerCookie = await makeSessionCookie(linker.id)
    const policy = await ctx.policy()
    // Anyone may link to anyone's log, so the log author is a third user.
    const author = await ctx.user("logatt-author")
    const log = await ctx.log(policy.id, author.id)
    const a = await makeAttachment(policy.id, uploader.id)

    await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", linkerCookie)
      .send({ logId: log.id, attachmentIds: [a.id] })

    const [row] = await links(policy.id, linkerCookie)
    expect(row.linkedBy.id).toBe(linker.id)
  })

  it("is idempotent - re-linking the same pair does not duplicate or error", async () => {
    const user = await ctx.user("logatt-idempotent")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)
    const a = await makeAttachment(policy.id, user.id)

    const body = { logId: log.id, attachmentIds: [a.id] }
    expect(
      (await request(app).post("/policy-log-attachments").set("Cookie", cookie).send(body)).status
    ).toBe(201)
    const second = await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", cookie)
      .send(body)
    expect(second.status).toBe(201)
    expect(second.body).toHaveLength(1)

    expect(await links(policy.id, cookie)).toHaveLength(1)
  })

  it("rejects an attachment from a different policy", async () => {
    const user = await ctx.user("logatt-crosspolicy")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const other = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)
    const stranger = await makeAttachment(other.id, user.id)

    const res = await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", cookie)
      .send({ logId: log.id, attachmentIds: [stranger.id] })
    expect(res.status).toBe(400)
    expect(await links(policy.id, cookie)).toEqual([])
  })

  it("404s an unknown log or attachment", async () => {
    const user = await ctx.user("logatt-404")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)
    const a = await makeAttachment(policy.id, user.id)

    expect(
      (
        await request(app)
          .post("/policy-log-attachments")
          .set("Cookie", cookie)
          .send({ logId: 999999999, attachmentIds: [a.id] })
      ).status
    ).toBe(404)

    expect(
      (
        await request(app)
          .post("/policy-log-attachments")
          .set("Cookie", cookie)
          .send({ logId: log.id, attachmentIds: [999999999] })
      ).status
    ).toBe(404)
  })

  it("400s an empty attachmentIds array", async () => {
    const user = await ctx.user("logatt-empty-ids")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)

    expect(
      (
        await request(app)
          .post("/policy-log-attachments")
          .set("Cookie", cookie)
          .send({ logId: log.id, attachmentIds: [] })
      ).status
    ).toBe(400)
  })
})

describe("DELETE /policy-log-attachments/:id", () => {
  it("removes a link made by someone else", async () => {
    const linker = await ctx.user("logatt-del-linker")
    const linkerCookie = await makeSessionCookie(linker.id)
    const other = await ctx.user("logatt-del-other")
    const otherCookie = await makeSessionCookie(other.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, linker.id)
    const a = await makeAttachment(policy.id, linker.id)

    await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", linkerCookie)
      .send({ logId: log.id, attachmentIds: [a.id] })
    const [row] = await links(policy.id, linkerCookie)

    const res = await request(app)
      .delete(`/policy-log-attachments/${row.id}`)
      .set("Cookie", otherCookie)
    expect(res.status).toBe(204)
    expect(await links(policy.id, linkerCookie)).toEqual([])
  })

  it("404s an unknown link", async () => {
    const user = await ctx.user("logatt-del-404")
    const cookie = await makeSessionCookie(user.id)
    expect(
      (await request(app).delete("/policy-log-attachments/999999999").set("Cookie", cookie)).status
    ).toBe(404)
  })
})

describe("voided documents", () => {
  it("drops out of the link list for staff and stays for admins", async () => {
    const staff = await ctx.user("logatt-void-staff")
    const staffCookie = await makeSessionCookie(staff.id)
    const admin = await ctx.user("logatt-void-admin", "admin")
    const adminCookie = await makeSessionCookie(admin.id)
    const policy = await ctx.policy()

    const invoice = await request(app)
      .post("/invoices")
      .set("Cookie", staffCookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 400 }],
      })
    expect(invoice.status).toBe(201)

    expect(await links(policy.id, staffCookie)).toHaveLength(1)

    const voided = await request(app)
      .post(`/invoices/${invoice.body.id}/void`)
      .set("Cookie", staffCookie)
      .send({ reason: "keyed twice" })
    expect(voided.status).toBe(200)

    expect(await links(policy.id, staffCookie)).toEqual([])
    const adminRows = await links(policy.id, adminCookie)
    expect(adminRows).toHaveLength(1)
    expect(adminRows[0].attachment.isVoided).toBe(true)
  })
})

describe("auto-linked generated documents", () => {
  it("links the invoice PDF to the log the same write appended", async () => {
    const user = await ctx.user("logatt-auto-invoice")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const invoice = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 400 }],
      })
    expect(invoice.status).toBe(201)

    const rows = await links(policy.id, cookie)
    expect(rows).toHaveLength(1)
    expect(rows[0].attachment.sourceType).toBe("invoice")
    expect(rows[0].linkedBy.id).toBe(user.id)

    const logs = await request(app).get(`/policy-logs?policyId=${policy.id}`).set("Cookie", cookie)
    const invoiceLog = logs.body.find((log: { body: string }) =>
      log.body.startsWith(`Invoice #${invoice.body.id} created`)
    )
    expect(invoiceLog).toBeDefined()
    expect(rows[0].logId).toBe(invoiceLog.id)
  })

  it("links the receipt PDF to the payment's own log, not the invoice's", async () => {
    const user = await ctx.user("logatt-auto-receipt")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const invoice = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 400 }],
      })
    const payment = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.body.id, method: "cash", amount: 400 })
    expect(payment.status).toBe(201)

    const rows = await links(policy.id, cookie)
    expect(rows).toHaveLength(2)
    const receiptLink = rows.find((row) => row.attachment.sourceType === "receipt")!
    const invoiceLink = rows.find((row) => row.attachment.sourceType === "invoice")!
    expect(receiptLink.logId).not.toBe(invoiceLink.logId)

    const logs = await request(app).get(`/policy-logs?policyId=${policy.id}`).set("Cookie", cookie)
    const paymentLog = logs.body.find((log: { body: string }) => log.body.startsWith("Payment of"))
    expect(receiptLink.logId).toBe(paymentLog.id)
  })

  it("links the change form to the 'Policy updated' log the edit wrote", async () => {
    const user = await ctx.user("logatt-auto-change")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy({ status: "pending" })

    const updated = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ status: "active" })
    expect(updated.status).toBe(200)

    const rows = await links(policy.id, cookie)
    expect(rows).toHaveLength(1)
    expect(rows[0].attachment.sourceType).toBe("policy_change")

    const logs = await request(app).get(`/policy-logs?policyId=${policy.id}`).set("Cookie", cookie)
    const changeLog = logs.body.find((log: { body: string }) =>
      log.body.startsWith("Policy updated:")
    )
    expect(changeLog).toBeDefined()
    expect(rows[0].logId).toBe(changeLog.id)
  })

  it("still files the document unlinked when the PDF's log write failed", async () => {
    // storeGeneratedPolicyAttachment swallows a bad linkToLogId, so the
    // document lands and can be linked by hand later.
    const user = await ctx.user("logatt-auto-nolog")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const attachment = await storeGeneratedPolicyAttachment({
      policyId: policy.id,
      pdf: Buffer.from("%PDF-1.4"),
      fileName: "Orphan.pdf",
      keySlug: "orphan",
      description: null,
      sourceType: "policy_change",
      sourceId: policy.id,
      createdBy: user.id,
      linkToLogId: 999999999,
    })

    expect(attachment.id).toBeGreaterThan(0)
    expect(await links(policy.id, cookie)).toEqual([])
  })
})
