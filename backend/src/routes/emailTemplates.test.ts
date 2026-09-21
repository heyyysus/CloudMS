import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { WELCOME_TEMPLATE_KEY } from "../emails"
import { findEmailTemplateByKey } from "../repositories"
import { TestContext } from "./testHelpers"

const ctx = new TestContext()

afterEach(() => ctx.cleanup())

describe("GET/PUT /email-templates/:key", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const user = await ctx.user("tmpl-staff", "staff")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
      .set("Cookie", cookie)

    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown template key", async () => {
    const user = await ctx.user("tmpl-unknown", "admin")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app).get("/email-templates/bogus").set("Cookie", cookie)

    expect(res.status).toBe(404)
  })

  it("returns the seeded welcome template with its merge fields", async () => {
    const user = await ctx.user("tmpl-get", "admin")
    const cookie = await ctx.cookie(user.id)

    const res = await request(app)
      .get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
      .set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body.template.key).toBe(WELCOME_TEMPLATE_KEY)
    expect(res.body.mergeFields).toEqual(
      expect.arrayContaining(["name", "email", "role", "appUrl", "inviterName"])
    )
  })

  // Each test below mints its own org via ctx.user(), which seeds that org's
  // own welcome template (see TestContext.org()); the outer afterEach's
  // ctx.cleanup() tears the whole org down, so there is nothing shared across
  // tests to save and restore here.
  describe("PUT", () => {
    it("returns 400 for an unknown merge field", async () => {
      const user = await ctx.user("tmpl-badfield", "admin")
      const cookie = await ctx.cookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "Hi {{bogus}}", body: "Body" })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain("bogus")
    })

    it("returns 400 for an empty subject", async () => {
      const user = await ctx.user("tmpl-emptysubj", "admin")
      const cookie = await ctx.cookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "", body: "Body" })

      expect(res.status).toBe(400)
    })

    it("saves an updated template using only whitelisted merge fields", async () => {
      const user = await ctx.user("tmpl-save", "admin")
      const cookie = await ctx.cookie(user.id)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "Hi {{name}}", body: "Welcome, {{name}} ({{email}})." })

      expect(res.status).toBe(200)
      expect(res.body.template.subject).toBe("Hi {{name}}")
      expect(res.body.template.updatedBy).toBe(user.id)
    })

    // Every org gets its own welcome row (see TestContext.org()); a PUT in
    // one org must never edit another org's.
    it("only ever touches the caller's own org's welcome template", async () => {
      const user = await ctx.user("tmpl-org-a", "admin")
      const cookie = await ctx.cookie(user.id)
      const otherOrg = await ctx.org()
      const otherTemplate = await findEmailTemplateByKey(otherOrg.id, WELCOME_TEMPLATE_KEY)

      const res = await request(app)
        .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
        .set("Cookie", cookie)
        .send({ subject: "Hi {{name}} from A", body: "Body" })

      expect(res.status).toBe(200)
      expect(res.body.template.orgId).toBe(await ctx.orgId())

      const stillOther = await findEmailTemplateByKey(otherOrg.id, WELCOME_TEMPLATE_KEY)
      expect(stillOther!.subject).toBe(otherTemplate!.subject)
    })
  })
})
