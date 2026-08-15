import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"
import { db } from "./db"
import { emailLog, users } from "./db/schema"
import { extractMergeFields, renderTemplate, sendWelcomeEmail } from "./emails"
import { makeTestUser } from "./routes/testHelpers"
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
  const createdUserIds: number[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
    if (createdUserIds.length) {
      await db.delete(emailLog).where(inArray(emailLog.triggeredBy, createdUserIds))
      await db.delete(users).where(inArray(users.id, createdUserIds))
      createdUserIds.length = 0
    }
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

  async function makeUsers(): Promise<{ invitee: User; admin: User }> {
    const invitee = await makeTestUser("emails-invitee")
    const admin = await makeTestUser("emails-admin", "admin")
    createdUserIds.push(invitee.id, admin.id)
    return { invitee, admin }
  }

  it("sends the email and logs a sent entry", async () => {
    configureMail()
    const fetchMock = stubResend({ id: "msg_1" })
    const { invitee, admin } = await makeUsers()

    const result = await sendWelcomeEmail(invitee, admin)

    expect(result).toEqual({ status: "sent", resendId: "msg_1" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.recipient, invitee.email))
    expect(logRow.status).toBe("sent")
    expect(logRow.resendId).toBe("msg_1")
    expect(logRow.triggeredBy).toBe(admin.id)
  })

  it("logs a failed entry and returns a failure result when mail isn't configured", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const { invitee, admin } = await makeUsers()

    const result = await sendWelcomeEmail(invitee, admin)

    expect(result.status).toBe("failed")
    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.recipient, invitee.email))
    expect(logRow.status).toBe("failed")
  })
})
