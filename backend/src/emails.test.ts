import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"
import { db, runInOrg } from "./db"
import { emailLog } from "./db/schema"
import {
  extractMergeFields,
  renderTemplate,
  sendCorrespondenceEmail,
  sendWelcomeEmail,
} from "./emails"
import { makeTestUser, TestContext } from "./routes/testHelpers"
import type { User } from "./types"

describe("extractMergeFields", () => {
  it("returns each field once, in first-seen order", () => {
    expect(extractMergeFields("Hi {{name}}, your email is {{email}}. Bye {{name}}.")).toEqual([
      "name",
      "email",
    ])
  })

  it("tolerates whitespace inside braces", () => {
    expect(extractMergeFields("Hi {{  name  }}")).toEqual(["name"])
  })

  it("ignores single braces", () => {
    expect(extractMergeFields("A { set } of braces, {not a field}")).toEqual([])
  })

  it("returns an empty array when there are no fields", () => {
    expect(extractMergeFields("Plain text.")).toEqual([])
  })
})

describe("renderTemplate", () => {
  it("substitutes known fields", () => {
    expect(renderTemplate("Hi {{name}}", { name: "Ada" })).toBe("Hi Ada")
  })

  it("renders unknown fields as an empty string", () => {
    expect(renderTemplate("Hi {{name}} {{bogus}}", { name: "Ada" })).toBe("Hi Ada ")
  })
})

describe("sendWelcomeEmail", () => {
  const ORIGINAL_ENV = { ...process.env }
  const ctx = new TestContext()

  afterEach(async () => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
    await ctx.cleanup()
  })

  function configureMail() {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
  }

  function stubResend(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn(async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    }))
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  async function makeUsers(): Promise<{ invitee: User; admin: User; orgId: string }> {
    const orgId = await ctx.orgId()
    const invitee = await makeTestUser("emails-invitee")
    const admin = await makeTestUser("emails-admin")
    ctx.track("user", invitee.id)
    ctx.track("user", admin.id)
    return { invitee, admin, orgId }
  }

  it("sends the email and logs a sent entry", async () => {
    configureMail()
    const fetchMock = stubResend({ id: "msg_1" })
    const { invitee, admin, orgId } = await makeUsers()

    const result = await runInOrg(orgId, () => sendWelcomeEmail(orgId, invitee, admin, "staff"))

    expect(result).toEqual({ status: "sent", resendId: "msg_1" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [logRow] = await runInOrg(orgId, () =>
      db.select().from(emailLog).where(eq(emailLog.recipient, invitee.email))
    )
    expect(logRow.status).toBe("sent")
    expect(logRow.resendId).toBe("msg_1")
    expect(logRow.triggeredBy).toBe(admin.id)
  })

  // emails.ts:109 threads the organization's reply-to into the welcome send.
  // Nothing asserted it reached Resend, so dropping that argument stayed green.
  it("sends the organization's reply_to", async () => {
    configureMail()
    const fetchMock = stubResend({ id: "msg_replyto" })
    const org = await ctx.org({ mailReplyTo: "welcome@example.com" })
    const { invitee, admin } = await makeUsers()

    await runInOrg(org.id, () => sendWelcomeEmail(org.id, invitee, admin, "staff"))

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.reply_to).toBe("welcome@example.com")
  })

  // emails.ts:289, the correspondence call site reached from routes/mail.ts:181.
  // The reply-to tests in routes/mail.test.ts cover routes/mail.ts:66, which is
  // a different call into sendEmail, so this one was unasserted.
  it("sends the organization's reply_to on a correspondence send", async () => {
    configureMail()
    const fetchMock = stubResend({ id: "msg_corr" })
    const org = await ctx.org({ mailReplyTo: "corr@example.com" })
    const admin = await makeTestUser("emails-corr-admin")
    ctx.track("user", admin.id)

    await runInOrg(org.id, () =>
      sendCorrespondenceEmail({
        orgId: org.id,
        template: { key: "corr-test", subject: "Hi", body: "Hello" },
        values: {},
        to: ["client@example.com"],
        cc: [],
        triggeredBy: admin.id,
      })
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.reply_to).toBe("corr@example.com")
  })

  it("logs a failed entry and returns a failure result when mail isn't configured", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const { invitee, admin, orgId } = await makeUsers()

    const result = await runInOrg(orgId, () => sendWelcomeEmail(orgId, invitee, admin, "staff"))

    expect(result.status).toBe("failed")
    const [logRow] = await runInOrg(orgId, () =>
      db.select().from(emailLog).where(eq(emailLog.recipient, invitee.email))
    )
    expect(logRow.status).toBe("failed")
  })
})
