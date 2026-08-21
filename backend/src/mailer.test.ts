import { afterEach, describe, expect, it, vi } from "vitest"
import { MailNotConfiguredError, MailSendError, plainTextToHtml, sendEmail } from "./mailer"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

function stubResend(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _requestInit?: RequestInit) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("sendEmail", () => {
  it("throws MailNotConfiguredError when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"

    await expect(
      sendEmail({ to: ["a@example.com"], subject: "hi", html: "<p>hi</p>", text: "hi" })
    ).rejects.toThrow(MailNotConfiguredError)
  })

  it("throws MailNotConfiguredError when MAIL_FROM is unset", async () => {
    process.env.RESEND_API_KEY = "re_test"
    delete process.env.MAIL_FROM

    await expect(
      sendEmail({ to: ["a@example.com"], subject: "hi", html: "<p>hi</p>", text: "hi" })
    ).rejects.toThrow(MailNotConfiguredError)
  })

  it("posts to the Resend API with a bearer token and returns the id", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
    const fetchMock = stubResend({ id: "msg_123" })

    const result = await sendEmail({
      to: ["client@example.com"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    })

    expect(result).toEqual({ id: "msg_123" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init?.method).toBe("POST")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test")
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      from: "Cloud CMS <noreply@example.com>",
      to: ["client@example.com"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    })
    expect(body.reply_to).toBeUndefined()
  })

  it("includes attachments in the request body when given, and omits the key otherwise", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
    const fetchMock = stubResend({ id: "msg_123" })

    await sendEmail({
      to: ["client@example.com"],
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      attachments: [{ filename: "dec.pdf", content: "QkFTRTY0" }],
    })
    const withAttachments = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(withAttachments.attachments).toEqual([{ filename: "dec.pdf", content: "QkFTRTY0" }])

    await sendEmail({ to: ["client@example.com"], subject: "Hi", html: "<p>Hi</p>", text: "Hi" })
    const withoutAttachments = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(withoutAttachments).not.toHaveProperty("attachments")
  })

  it("includes reply_to when MAIL_REPLY_TO is set", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
    process.env.MAIL_REPLY_TO = "agency@example.com"
    const fetchMock = stubResend({ id: "msg_123" })

    await sendEmail({ to: ["client@example.com"], subject: "Hi", html: "<p>Hi</p>", text: "Hi" })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.reply_to).toBe("agency@example.com")
  })

  it("throws MailSendError with the Resend error detail on a non-2xx response", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
    stubResend(
      { name: "rate_limit_exceeded", message: "Too many requests.", statusCode: 429 },
      { ok: false, status: 429 }
    )

    await expect(
      sendEmail({ to: ["a@example.com"], subject: "hi", html: "<p>hi</p>", text: "hi" })
    ).rejects.toThrow(MailSendError)
  })

  it("throws MailSendError when the request itself fails or times out", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted due to timeout")
      })
    )

    await expect(
      sendEmail({ to: ["a@example.com"], subject: "hi", html: "<p>hi</p>", text: "hi" })
    ).rejects.toThrow(MailSendError)
  })
})

describe("plainTextToHtml", () => {
  it("escapes HTML and converts newlines to <br>", () => {
    expect(plainTextToHtml('Hi <b>"there"</b>\nSecond line')).toBe(
      '<div style="font-family: sans-serif; white-space: pre-wrap;">Hi &lt;b&gt;&quot;there&quot;&lt;/b&gt;<br>Second line</div>'
    )
  })
})
