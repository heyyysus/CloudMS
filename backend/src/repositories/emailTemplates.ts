import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { emailTemplates } from "../db/schema"
import type { EmailTemplate } from "../types"

// key is no longer globally unique (email_templates now scopes it per org),
// so this orders by orgId to stay deterministic on a seeded multi-org
// database. Sub-issue 4 replaces this with an explicit orgId argument.
export async function findEmailTemplateByKey(key: string): Promise<EmailTemplate | undefined> {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.key, key))
    .orderBy(emailTemplates.orgId)
    .limit(1)
  return row
}

// --- Correspondence templates ---------------------------------------------
// All scoped to kind = "correspondence" so the singleton welcome row can never
// surface in the admin correspondence CRUD.

export async function listCorrespondenceTemplates(): Promise<EmailTemplate[]> {
  return db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.kind, "correspondence"))
    .orderBy(desc(emailTemplates.updatedAt))
}

export async function findCorrespondenceTemplateById(
  id: string
): Promise<EmailTemplate | undefined> {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.kind, "correspondence")))
  return row
}

export async function createCorrespondenceTemplate(input: {
  key: string
  name: string
  subject: string
  body: string
  updatedBy: string | null
}): Promise<EmailTemplate> {
  const [row] = await db
    .insert(emailTemplates)
    .values({ ...input, kind: "correspondence" })
    .returning()
  return row
}

export async function updateCorrespondenceTemplate(
  id: string,
  input: { name: string; subject: string; body: string; updatedBy: string | null }
): Promise<EmailTemplate | undefined> {
  const [row] = await db
    .update(emailTemplates)
    .set({
      name: input.name,
      subject: input.subject,
      body: input.body,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.kind, "correspondence")))
    .returning()
  return row
}

export async function deleteCorrespondenceTemplate(id: string): Promise<boolean> {
  const deleted = await db
    .delete(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.kind, "correspondence")))
    .returning({ id: emailTemplates.id })
  return deleted.length > 0
}

export async function upsertEmailTemplate(input: {
  key: string
  subject: string
  body: string
  updatedBy: string | null
}): Promise<EmailTemplate> {
  const [row] = await db
    .insert(emailTemplates)
    .values(input)
    .onConflictDoUpdate({
      target: [emailTemplates.orgId, emailTemplates.key],
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
