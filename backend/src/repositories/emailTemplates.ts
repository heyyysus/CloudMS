import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { emailTemplates } from "../db/schema"
import type { EmailTemplate } from "../types"

export async function findEmailTemplateByKey(
  orgId: string,
  key: string
): Promise<EmailTemplate | undefined> {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.key, key)))
  return row
}

// --- Correspondence templates ---------------------------------------------
// All scoped to kind = "correspondence" so the singleton welcome row can never
// surface in the admin correspondence CRUD.

export async function listCorrespondenceTemplates(orgId: string): Promise<EmailTemplate[]> {
  return db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.kind, "correspondence")))
    .orderBy(desc(emailTemplates.updatedAt))
}

export async function findCorrespondenceTemplateById(
  orgId: string,
  id: string
): Promise<EmailTemplate | undefined> {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.id, id),
        eq(emailTemplates.orgId, orgId),
        eq(emailTemplates.kind, "correspondence")
      )
    )
  return row
}

export async function createCorrespondenceTemplate(
  orgId: string,
  input: {
    key: string
    name: string
    subject: string
    body: string
    updatedBy: string | null
  }
): Promise<EmailTemplate> {
  const [row] = await db
    .insert(emailTemplates)
    .values({ ...input, orgId, kind: "correspondence" })
    .returning()
  return row
}

export async function updateCorrespondenceTemplate(
  orgId: string,
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
    .where(
      and(
        eq(emailTemplates.id, id),
        eq(emailTemplates.orgId, orgId),
        eq(emailTemplates.kind, "correspondence")
      )
    )
    .returning()
  return row
}

export async function deleteCorrespondenceTemplate(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(emailTemplates)
    .where(
      and(
        eq(emailTemplates.id, id),
        eq(emailTemplates.orgId, orgId),
        eq(emailTemplates.kind, "correspondence")
      )
    )
    .returning({ id: emailTemplates.id })
  return deleted.length > 0
}

export async function upsertEmailTemplate(
  orgId: string,
  input: {
    key: string
    subject: string
    body: string
    updatedBy: string | null
  }
): Promise<EmailTemplate> {
  const [row] = await db
    .insert(emailTemplates)
    .values({ ...input, orgId, kind: "welcome" })
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
