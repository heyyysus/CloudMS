import { eq } from "drizzle-orm"
import { db } from "../db"
import { emailTemplates } from "../db/schema"
import type { EmailTemplate } from "../types"

export async function findEmailTemplateByKey(key: string): Promise<EmailTemplate | undefined> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key))
  return row
}

export async function upsertEmailTemplate(input: {
  key: string
  subject: string
  body: string
  updatedBy: number | null
}): Promise<EmailTemplate> {
  const [row] = await db
    .insert(emailTemplates)
    .values(input)
    .onConflictDoUpdate({
      target: emailTemplates.key,
      set: {
        subject: input.subject,
        body: input.body,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}
