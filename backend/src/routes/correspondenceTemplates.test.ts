import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { CORRESPONDENCE_MERGE_FIELDS } from "../emails"
import { deleteCorrespondenceTemplate } from "../repositories"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()

// Templates aren't tracked by TestContext; remove any created here directly.
const templateIds: number[] = []

afterEach(async () => {
  for (const id of templateIds.splice(0)) await deleteCorrespondenceTemplate(id)
  await ctx.cleanup()
})

async function adminCookie(prefix: string): Promise<string> {
  const user = await ctx.user(prefix, "admin")
  return makeSessionCookie(user.id)
}

const VALID_BODY = {
  name: "Renewal Reminder",
  subject: "Your policy {{policyNumber}} is renewing",
  body: "Hi {{clientFullName}}, your {{carrierName}} policy renews soon.\n\n- {{agentName}}",
}

describe("correspondence templates", () => {
  describe("GET /correspondence-templates", () => {
    it("returns 401 without a cookie", async () => {
      const res = await request(app).get("/correspondence-templates")
      expect(res.status).toBe(401)
    })

    // Staff read this list to pick a template when sending correspondence
    // from a policy card, so unlike the write routes below it is not
    // admin-only.
    it("allows a non-admin user to list templates", async () => {
      const user = await ctx.user("corr-staff", "staff")
      const cookie = await makeSessionCookie(user.id)
      const res = await request(app).get("/correspondence-templates").set("Cookie", cookie)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.templates)).toBe(true)
    })

    it("lists templates with the merge-field catalog", async () => {
      const cookie = await adminCookie("corr-list")
      const created = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send(VALID_BODY)
      templateIds.push(created.body.id)

      const res = await request(app).get("/correspondence-templates").set("Cookie", cookie)

      expect(res.status).toBe(200)
      expect(res.body.mergeFields).toEqual(expect.arrayContaining([...CORRESPONDENCE_MERGE_FIELDS]))
      expect(res.body.templates.map((t: { id: number }) => t.id)).toContain(created.body.id)
    })
  })

  describe("POST /correspondence-templates", () => {
    it("creates a template and returns 201 with a generated key", async () => {
      const cookie = await adminCookie("corr-create")
      const res = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send(VALID_BODY)
      templateIds.push(res.body.id)

      expect(res.status).toBe(201)
      expect(res.body.name).toBe(VALID_BODY.name)
      expect(res.body.kind).toBe("correspondence")
      expect(res.body.key).toMatch(/^correspondence-renewal-reminder-/)
    })

    it("returns 400 for an unknown merge field", async () => {
      const cookie = await adminCookie("corr-badfield")
      const res = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send({ ...VALID_BODY, body: "Hello {{bogusField}}" })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain("bogusField")
    })

    it("returns 400 for a missing name", async () => {
      const cookie = await adminCookie("corr-noname")
      const res = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send({ subject: "Hi", body: "Body" })

      expect(res.status).toBe(400)
    })

    it("returns 403 for a non-admin user", async () => {
      const user = await ctx.user("corr-create-staff", "staff")
      const cookie = await makeSessionCookie(user.id)
      const res = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send(VALID_BODY)

      expect(res.status).toBe(403)
    })
  })

  describe("PATCH /correspondence-templates/:id", () => {
    it("updates a template", async () => {
      const cookie = await adminCookie("corr-update")
      const created = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send(VALID_BODY)
      templateIds.push(created.body.id)

      const res = await request(app)
        .patch(`/correspondence-templates/${created.body.id}`)
        .set("Cookie", cookie)
        .send({ ...VALID_BODY, name: "Renewal Notice v2" })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe("Renewal Notice v2")
    })

    it("returns 404 for a missing id", async () => {
      const cookie = await adminCookie("corr-update-404")
      const res = await request(app)
        .patch("/correspondence-templates/99999999")
        .set("Cookie", cookie)
        .send(VALID_BODY)

      expect(res.status).toBe(404)
    })

    // Staff can list templates (see the GET above) but must not author them.
    it("returns 403 for a non-admin user", async () => {
      const adminCookieValue = await adminCookie("corr-update-owner")
      const created = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", adminCookieValue)
        .send(VALID_BODY)
      templateIds.push(created.body.id)

      const user = await ctx.user("corr-update-staff", "staff")
      const cookie = await makeSessionCookie(user.id)
      const res = await request(app)
        .patch(`/correspondence-templates/${created.body.id}`)
        .set("Cookie", cookie)
        .send({ ...VALID_BODY, name: "Staff edit" })

      expect(res.status).toBe(403)
    })
  })

  it("never lists the welcome template (kind-scoped)", async () => {
    const cookie = await adminCookie("corr-scope")
    const res = await request(app).get("/correspondence-templates").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.templates.every((t: { kind: string }) => t.kind === "correspondence")).toBe(
      true
    )
    expect(res.body.templates.map((t: { key: string }) => t.key)).not.toContain("welcome")
  })

  describe("DELETE /correspondence-templates/:id", () => {
    it("deletes a template and returns 204", async () => {
      const cookie = await adminCookie("corr-delete")
      const created = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", cookie)
        .send(VALID_BODY)

      const res = await request(app)
        .delete(`/correspondence-templates/${created.body.id}`)
        .set("Cookie", cookie)

      expect(res.status).toBe(204)

      const after = await request(app).get("/correspondence-templates").set("Cookie", cookie)
      expect(after.body.templates.map((t: { id: number }) => t.id)).not.toContain(created.body.id)
    })

    it("returns 404 for a missing id", async () => {
      const cookie = await adminCookie("corr-delete-404")
      const res = await request(app)
        .delete("/correspondence-templates/99999999")
        .set("Cookie", cookie)
      expect(res.status).toBe(404)
    })

    it("returns 403 for a non-admin user", async () => {
      const adminCookieValue = await adminCookie("corr-delete-owner")
      const created = await request(app)
        .post("/correspondence-templates")
        .set("Cookie", adminCookieValue)
        .send(VALID_BODY)
      templateIds.push(created.body.id)

      const user = await ctx.user("corr-delete-staff", "staff")
      const cookie = await makeSessionCookie(user.id)
      const res = await request(app)
        .delete(`/correspondence-templates/${created.body.id}`)
        .set("Cookie", cookie)

      expect(res.status).toBe(403)
    })
  })
})
