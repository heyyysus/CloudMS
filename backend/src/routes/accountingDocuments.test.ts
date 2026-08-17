import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { putObject } from "../storage/r2"
import { makeSessionCookie, TestContext } from "./testHelpers"

// Creating an invoice and recording a payment each upload a generated PDF
// through storage/r2's putObject. Mocked so tests don't need real R2
// credentials; individual tests override it to exercise the failure path.
vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return { ...actual, putObject: vi.fn().mockResolvedValue(undefined) }
})

const ctx = new TestContext()
afterEach(() => {
  vi.mocked(putObject).mockReset().mockResolvedValue(undefined)
  return ctx.cleanup()
})

interface AttachmentRow {
  fileName: string
  mimeType: string
  description: string | null
  isVoided: boolean
  sourceType: string
  sourceId: number | null
}

async function attachments(policyId: number, cookie: string): Promise<AttachmentRow[]> {
  const res = await request(app)
    .get(`/policy-attachments?policyId=${policyId}`)
    .set("Cookie", cookie)
  expect(res.status).toBe(200)
  return res.body
}

async function makeInvoice(cookie: string, policyId: number, amount = 400) {
  const res = await request(app)
    .post("/invoices")
    .set("Cookie", cookie)
    .send({
      policyId,
      items: [{ category: "agency", type: "new_business_fee", amount }],
    })
  expect(res.status).toBe(201)
  return res.body
}

describe("invoice documents", () => {
  it("files a numbered PDF when an invoice is created", async () => {
    const user = await ctx.user("acctdoc-invoice")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const invoice = await makeInvoice(cookie, policy.id)

    const rows = await attachments(policy.id, cookie)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fileName: `Invoice #${String(invoice.id).padStart(5, "0")}.pdf`,
      mimeType: "application/pdf",
      description: "Auto-generated invoice",
      isVoided: false,
      sourceType: "invoice",
      sourceId: invoice.id,
    })
    expect(vi.mocked(putObject)).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^policy-attachments/${policy.id}/.*-invoice\\.pdf$`)),
      expect.any(Buffer),
      "application/pdf"
    )
    // A real PDF, not an empty buffer.
    const [, buffer] = vi.mocked(putObject).mock.calls[0]
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("still returns 201 when R2 is unavailable, without filing an attachment", async () => {
    vi.mocked(putObject).mockRejectedValueOnce(new Error("no R2"))

    const user = await ctx.user("acctdoc-invoice-nor2")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    await makeInvoice(cookie, policy.id)
    expect(await attachments(policy.id, cookie)).toHaveLength(0)
  })
})

describe("receipt documents", () => {
  it("files one numbered PDF per payment", async () => {
    const user = await ctx.user("acctdoc-receipt")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)

    const first = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 150 })
    expect(first.status).toBe(201)
    const second = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "check", amount: 250 })
    expect(second.status).toBe(201)

    const rows = await attachments(policy.id, cookie)
    // One invoice document + one receipt document per payment.
    expect(rows).toHaveLength(3)
    const receipts = rows.filter((row) => row.sourceType === "receipt")
    expect(receipts.map((row) => row.fileName).sort()).toEqual(
      [first.body.id, second.body.id]
        .map((id) => `Receipt #${String(id).padStart(5, "0")}.pdf`)
        .sort()
    )
    expect(receipts.every((row) => row.description === "Auto-generated receipt")).toBe(true)
  })

  it("hides the receipt document from staff once the payment is voided", async () => {
    const staff = await ctx.user("acctdoc-void-staff")
    const staffCookie = await makeSessionCookie(staff.id)
    const admin = await ctx.user("acctdoc-void-admin", "admin")
    const adminCookie = await makeSessionCookie(admin.id)
    const policy = await ctx.policy()
    const invoice = await makeInvoice(staffCookie, policy.id)

    const payment = await request(app)
      .post("/payments")
      .set("Cookie", staffCookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })
    expect(payment.status).toBe(201)
    const receiptFileName = `Receipt #${String(payment.body.id).padStart(5, "0")}.pdf`

    expect((await attachments(policy.id, staffCookie)).map((r) => r.fileName)).toContain(
      receiptFileName
    )

    const voided = await request(app)
      .post(`/payments/${payment.body.payment.id}/void`)
      .set("Cookie", adminCookie)
      .send({ reason: "keyed twice" })
    expect(voided.status).toBe(200)

    const staffRows = await attachments(policy.id, staffCookie)
    expect(staffRows.map((row) => row.fileName)).not.toContain(receiptFileName)

    const adminRows = await attachments(policy.id, adminCookie)
    const receiptRow = adminRows.find((row) => row.fileName === receiptFileName)
    expect(receiptRow).toBeDefined()
    expect(receiptRow!.isVoided).toBe(true)
  })

  it("404s the download link for a voided document unless the caller is an admin", async () => {
    const staff = await ctx.user("acctdoc-link-staff")
    const staffCookie = await makeSessionCookie(staff.id)
    const admin = await ctx.user("acctdoc-link-admin", "admin")
    const adminCookie = await makeSessionCookie(admin.id)
    const policy = await ctx.policy()
    const invoice = await makeInvoice(staffCookie, policy.id)

    const payment = await request(app)
      .post("/payments")
      .set("Cookie", staffCookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })
    const receiptId = payment.body.id

    // Grab the attachment's id while it's still visible.
    const before = await attachments(policy.id, staffCookie)
    const attachmentId = (
      before as unknown as { id: number; sourceType: string; sourceId: number }[]
    ).find((row) => row.sourceType === "receipt" && row.sourceId === receiptId)!.id

    await request(app)
      .post(`/payments/${payment.body.payment.id}/void`)
      .set("Cookie", adminCookie)
      .send({})

    const staffLink = await request(app)
      .get(`/policy-attachments/${attachmentId}/link`)
      .set("Cookie", staffCookie)
    expect(staffLink.status).toBe(404)

    // The admin gets past the visibility check; R2 isn't configured in tests,
    // so the presign itself fails with 503 rather than 404.
    const adminLink = await request(app)
      .get(`/policy-attachments/${attachmentId}/link`)
      .set("Cookie", adminCookie)
    expect(adminLink.status).not.toBe(404)
  })
})

describe("voiding an invoice", () => {
  it("hides the invoice document from staff", async () => {
    const staff = await ctx.user("acctdoc-void-inv-staff")
    const staffCookie = await makeSessionCookie(staff.id)
    const admin = await ctx.user("acctdoc-void-inv-admin", "admin")
    const adminCookie = await makeSessionCookie(admin.id)
    const policy = await ctx.policy()
    const invoice = await makeInvoice(staffCookie, policy.id)

    const voided = await request(app)
      .post(`/invoices/${invoice.id}/void`)
      .set("Cookie", adminCookie)
      .send({ reason: "wrong policy" })
    expect(voided.status).toBe(200)

    expect(await attachments(policy.id, staffCookie)).toHaveLength(0)

    const adminRows = await attachments(policy.id, adminCookie)
    expect(adminRows).toHaveLength(1)
    expect(adminRows[0].isVoided).toBe(true)
  })
})
