import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import app from "../app"
import { WELCOME_TEMPLATE_KEY } from "../emails"
import { findEmailTemplateByKey, upsertEmailTemplate } from "../repositories"
import type { EmailTemplate } from "../types"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()

afterEach(() => ctx.cleanup())

describe("GET/PUT /email-templates/:key", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const user = await ctx.user("tmpl-staff", "staff")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
      .set("Cookie", cookie)

    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown template key", async () => {
    const user = await ctx.user("tmpl-unknown", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).get("/email-templates/bogus").set("Cookie", cookie)

    expect(res.status).toBe(404)
  })

  it("returns the seeded welcome template with its merge fields", async () => {
    const user = await ctx.user("tmpl-get", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
      .set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body.template.key).toBe(WELCOME_TEMPLATE_KEY)
    expect(res.body.mergeFields).toEqual(
      expect.arrayContaining(["name", "email", "role", "appUrl", "inviterName"])
    )
  })

  describe("PUT", () => {
    let saved: EmailTemplate | undefined

    beforeEach(async () => {
      saved = await findEmailTemplateByKey(WELCOME_TEMPLATE_KEY)
    })

    afterEach(async () => {
      if (saved) {
        await upsertEmailTemplate({
          key: saved.key,
          subject: saved.subject,
          body: saved.body,
          updatedBy: saved.updatedBy,
        })
      }
    })

    it("returns 400 for an unknown merge field", async () => {
      const user = await ctx.user("tmpl-badfield", "admin")
      const cookie = await makeSessionCookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "Hi {{bogus}}", body: "Body" })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain("bogus")
    })

    it("returns 400 for an empty subject", async () => {
      const user = await ctx.user("tmpl-emptysubj", "admin")
      const cookie = await makeSessionCookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "", body: "Body" })

      expect(res.status).toBe(400)
    })

    it("saves an updated template using only whitelisted merge fields", async () => {
      const user = await ctx.user("tmpl-save", "admin")
      const cookie = await makeSessionCookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "Hi {{name}}", body: "Welcome, {{name}} ({{email}})." })

      expect(res.status).toBe(200)
      expect(res.body.template.subject).toBe("Hi {{name}}")
      expect(res.body.template.updatedBy).toBe(user.id)
    })
  })
})
