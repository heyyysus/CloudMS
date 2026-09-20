import { describe, expect, it } from "vitest"
import { ROW_ID_PATTERN, generateRowId } from "./ids"

describe("generateRowId", () => {
  it("produces a 22-char base64url string", () => {
    const id = generateRowId()
    expect(id).toHaveLength(22)
    expect(id).toMatch(ROW_ID_PATTERN)
  })

  it("draws distinct values", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => generateRowId()))
    expect(ids.size).toBe(10_000)
  })
})

describe("ROW_ID_PATTERN", () => {
  it("rejects malformed ids", () => {
    expect(ROW_ID_PATTERN.test("")).toBe(false)
    expect(ROW_ID_PATTERN.test("123")).toBe(false)
    expect(ROW_ID_PATTERN.test("1".repeat(21))).toBe(false)
    expect(ROW_ID_PATTERN.test("1".repeat(23))).toBe(false)
    expect(ROW_ID_PATTERN.test("!".repeat(22))).toBe(false)
    expect(ROW_ID_PATTERN.test("a+b/c=d".padEnd(22, "a"))).toBe(false)
  })
})
