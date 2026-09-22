// The core of "invite an email into an org": create-or-reactivate the
// membership, then send the welcome email. Shared by POST /users/invite and
// POST /organizations (which seats the new org's first admin the same way) -
// one place owns the deleted-user/already-a-member 409s and the welcome
// email so the two routes can't drift.
import { sendWelcomeEmail, SendWelcomeEmailResult } from "./emails"
import {
  createMembership,
  createUser,
  findMembership,
  findUserByEmail,
  updateMembership,
} from "./repositories"
import { isPgUniqueViolation } from "./routes/helpers"
import type { OrgMembership, User, UserRole } from "./types"

export type InviteResult =
  | { kind: "deleted-email"; deletedUserId: string }
  | { kind: "already-member" }
  | { kind: "duplicate-email" }
  | { kind: "invited"; user: User; membership: OrgMembership; email: SendWelcomeEmailResult }

export async function inviteToOrg(
  orgId: string,
  input: { email: string; name?: string | null; role: UserRole },
  actor: User
): Promise<InviteResult> {
  const { email, name, role } = input

  // includeDeleted so a previously-deleted account's address is offered
  // back as a restore rather than colliding on the unique constraint with
  // no way for the caller to see why.
  const existing = await findUserByEmail(email, { includeDeleted: true })
  if (existing?.deletedAt) {
    return { kind: "deleted-email", deletedUserId: existing.id }
  }

  let user: User
  let membership: OrgMembership
  if (existing) {
    // A live user: invite means "add a membership in this org", not
    // "create another users row" - the email is already provisioned.
    const existingMembership = await findMembership(existing.id, orgId)
    if (existingMembership?.isActive) {
      return { kind: "already-member" }
    }
    user = existing
    membership = existingMembership
      ? // Reactivating rather than inserting avoids the (user_id, org_id)
        // unique constraint an insert would hit.
        ((await updateMembership(existingMembership.id, {
          isActive: true,
          role,
        })) as OrgMembership)
      : await createMembership({ userId: existing.id, orgId, role })
  } else {
    try {
      user = await createUser({ email, name: name ?? null })
    } catch (err) {
      if (isPgUniqueViolation(err, "users_email_unique")) {
        return { kind: "duplicate-email" }
      }
      throw err
    }
    membership = await createMembership({ userId: user.id, orgId, role })
  }

  const emailResult = await sendWelcomeEmail(orgId, user, actor, role)
  return { kind: "invited", user, membership, email: emailResult }
}
