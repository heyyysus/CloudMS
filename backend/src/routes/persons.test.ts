import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /persons", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/persons")).status).toBe(401)
  })

  it("lists persons for any authenticated role", async () => {
    const user = await ctx.user("persons-list")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person()

    const res = await request(app).get("/persons").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((p: { id: number }) => p.id === person.id)).toBe(true)
  })
})

describe("GET /persons/:id", () => {
  it("returns a person by id", async () => {
    const user = await ctx.user("persons-get")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person({ firstName: "Findme" })

    const res = await request(app).get(`/persons/${person.id}`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.firstName).toBe("Findme")
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("persons-404")
    const cookie = await makeSessionCookie(user.id)

    expect((await request(app).get("/persons/999999999").set("Cookie", cookie)).status).toBe(404)
  })

  it("returns 400 for a non-numeric id", async () => {
    const user = await ctx.user("persons-badid")
    const cookie = await makeSessionCookie(user.id)

    expect((await request(app).get("/persons/abc").set("Cookie", cookie)).status).toBe(400)
  })
})

describe("POST /persons", () => {
  it("creates a person", async () => {
    const user = await ctx.user("persons-create")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).post("/persons").set("Cookie", cookie).send({
      firstName: "New",
      lastName: "Person",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
    })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTypeOf("number")
    ctx.track("person", res.body.id)
  })

  it("returns 400 for an invalid dateOfBirth", async () => {
    const user = await ctx.user("persons-baddate")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).post("/persons").set("Cookie", cookie).send({
      firstName: "Bad",
      lastName: "Date",
      dateOfBirth: "not-a-date",
      gender: "m",
      relationToInsured: "self",
    })
    expect(res.status).toBe(400)
  })
})

describe("PATCH /persons/:id", () => {
  it("updates a person", async () => {
    const user = await ctx.user("persons-update")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person({ lastName: "Before" })

    const res = await request(app)
      .patch(`/persons/${person.id}`)
      .set("Cookie", cookie)
      .send({ lastName: "After" })
    expect(res.status).toBe(200)
    expect(res.body.lastName).toBe("After")
  })
})

describe("DELETE /persons/:id", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("persons-del-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person()

    expect((await request(app).delete(`/persons/${person.id}`).set("Cookie", cookie)).status).toBe(
      403
    )
  })

  it("allows admins", async () => {
    const user = await ctx.user("persons-del-admin", "admin")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person()

    expect((await request(app).delete(`/persons/${person.id}`).set("Cookie", cookie)).status).toBe(
      204
    )
  })

  it("returns 409 when the person is still referenced by a client", async () => {
    const user = await ctx.user("persons-del-conflict", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()

    const res = await request(app).delete(`/persons/${client.namedInsuredId}`).set("Cookie", cookie)
    expect(res.status).toBe(409)
  })
})
