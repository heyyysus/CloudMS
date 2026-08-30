import { afterEach, describe, expect, it } from "vitest"
import { demoMode, forbiddenDemoEnvPresent } from "./demo"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("demoMode", () => {
  it("is false when DEMO_MODE is unset", () => {
    delete process.env.DEMO_MODE
    expect(demoMode()).toBe(false)
  })

  it("is true only for the exact string 'true'", () => {
    process.env.DEMO_MODE = "true"
    expect(demoMode()).toBe(true)

    process.env.DEMO_MODE = "TRUE"
    expect(demoMode()).toBe(false)

    process.env.DEMO_MODE = "1"
    expect(demoMode()).toBe(false)
  })
})

describe("forbiddenDemoEnvPresent", () => {
  it("returns an empty array when none of the forbidden vars are set", () => {
    expect(forbiddenDemoEnvPresent({})).toEqual([])
  })

  it("treats an empty string as unset", () => {
    expect(
      forbiddenDemoEnvPresent({
        RESEND_API_KEY: "",
        MAIL_FROM: "",
        R2_ACCOUNT_ID: "",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET_NAME: "",
      })
    ).toEqual([])
  })

  it.each([
    "RESEND_API_KEY",
    "MAIL_FROM",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ] as const)("names %s when it alone is set", (name) => {
    expect(forbiddenDemoEnvPresent({ [name]: "value" })).toEqual([name])
  })

  it("names all six when all are set", () => {
    expect(
      forbiddenDemoEnvPresent({
        RESEND_API_KEY: "re_x",
        MAIL_FROM: "noreply@example.com",
        R2_ACCOUNT_ID: "acct",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET_NAME: "bucket",
      })
    ).toEqual([
      "RESEND_API_KEY",
      "MAIL_FROM",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ])
  })
})
