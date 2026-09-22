import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { sendWelcomeEmail } from "../emails"
import { inviteToOrg } from "../invites"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"
import {
  createMembership,
  deleteSessionsByUserIdAndOrg,
  findMembership,
  findUserById,
  listOrgMembers,
  restoreUser,
  updateMembership,
  updateUser,
} from "../repositories"
import type { OrgMembership, User, UserRole } from "../types"
import { firstIssue, parseId } from "./helpers"
import { inviteUserBody, updateUserBody } from "./schemas"

export const usersRouter = Router()

// `googleSub` is the Google account identifier; it never leaves the server.
// Whether it is set is still useful to an admin - it distinguishes an invited
// user who has never signed in from one who has. deletedAt/deletedBy are
// server bookkeeping only - a deleted user is meant to look gone, not to show
// up in the payload with a timestamp explaining that it isn't, quite.
// `role`/`isActive` come from the membership, not the user row - they shadow
// the user row's own `isActive`, which stays the platform-level flag: a user
// disabled at the platform level is invisible here (rejected earlier, at
// requireSession) while an org-disabled member still shows up as isActive: false.
function adminUser(user: User, membership: Pick<OrgMembership, "role" | "isActive">) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { googleSub, deletedAt, deletedBy, isActive: _userIsActive, ...rest } = user
  return {
    ...rest,
    hasSignedIn: googleSub !== null,
    role: membership.role,
    isActive: membership.isActive,
  }
}

// Named "invite", not a plain POST /users: the operation's contract is
// "create the row and send the welcome email", not bare CRUD. Admin-only,
// since it both provisions login access and sends mail on the admin's
// behalf.
usersRouter.post(
  "/users/invite",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = inviteUserBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const result = await inviteToOrg(req.orgId!, parsed.data, req.user!)
    switch (result.kind) {
      case "deleted-email":
        res.status(409).json({
          error: "This email belonged to a deleted user",
          deletedUserId: result.deletedUserId,
        })
        return
      case "already-member":
        res.status(409).json({ error: "This user is already a member of this organization" })
        return
      case "duplicate-email":
        res.status(409).json({ error: "A user with this email already exists" })
        return
      case "invited":
        req.log.info(
          {
            invitedUserId: result.user.id,
            actorId: req.user?.id,
            emailStatus: result.email.status,
          },
          "user invited"
        )
        res
          .status(201)
          .json({ user: adminUser(result.user, result.membership), email: result.email })
        return
    }
  }
)

usersRouter.get(
  "/users",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const rows = await listOrgMembers(req.orgId!)
    res.json(rows.map((row) => adminUser(row.user, row)))
  }
)

usersRouter.patch(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const parsed = updateUserBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { name, role, isActive } = parsed.data

    // An admin editing their own row may rename themselves, but must not lock
    // themselves out or hand away their own access - the UI hides these too,
    // this is the enforcement.
    //
    // These two checks are also what guarantees the organization always keeps
    // at least one active admin, so no separate "last admin" rule is needed:
    // requireAuth + requireRole mean the actor here is always an active admin
    // of this org, and they can only ever demote or disable someone else, so
    // they themselves always survive the change.
    if (id === req.user!.id) {
      if (role !== undefined && role !== req.membership!.role) {
        res.status(400).json({ error: "You cannot change your own role" })
        return
      }
      if (isActive === false) {
        res.status(400).json({ error: "You cannot disable your own account" })
        return
      }
    }

    const membership = await findMembership(id, req.orgId!)
    if (!membership) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const user = name !== undefined ? await updateUser(id, { name }) : await findUserById(id)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const updatedMembership =
      role !== undefined || isActive !== undefined
        ? ((await updateMembership(membership.id, { role, isActive })) as OrgMembership)
        : membership

    // requireAuth already rejects a disabled membership on their next request
    // in this org, but dropping the rows makes the logout immediate and
    // leaves nothing to resurrect if the membership is re-enabled later.
    if (isActive === false) await deleteSessionsByUserIdAndOrg(id, req.orgId!)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, role, isActive },
      "user updated by admin"
    )
    res.json(adminUser(user, updatedMembership))
  }
)

usersRouter.post(
  "/users/:id/resend-welcome",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const membership = await findMembership(id, req.orgId!)
    if (!membership) {
      res.status(404).json({ error: "User not found" })
      return
    }
    const user = await findUserById(id)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const emailResult = await sendWelcomeEmail(req.orgId!, user, req.user!, membership.role)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, emailStatus: emailResult.status },
      "welcome email resent"
    )
    res.json({ email: emailResult })
  }
)

// Deactivates the caller's membership in the active org - not a platform-
// level delete (see softDeleteUser for that). To an admin this is meant to
// look permanent: the row disappears from GET /users for this org and can
// never sign in to it again; the only way back is re-inviting the same email
// to this org (see POST /users/invite).
usersRouter.delete(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    // Mirrors the self-guard on PATCH: the actor here is always an active
    // admin of this org, and they can only ever delete someone else, so one
    // admin always survives.
    if (id === req.user!.id) {
      res.status(400).json({ error: "You cannot delete your own account" })
      return
    }

    const target = await findUserById(id)
    if (!target) {
      res.status(404).json({ error: "User not found" })
      return
    }
    if (target.email === AUTOMATION_USER_EMAIL) {
      res.status(400).json({ error: "This account cannot be deleted" })
      return
    }

    const membership = await findMembership(id, req.orgId!)
    if (!membership) {
      res.status(404).json({ error: "User not found" })
      return
    }

    await updateMembership(membership.id, { isActive: false })
    // Same reasoning as the isActive: false branch on PATCH - immediate
    // logout rather than waiting for the session to expire.
    await deleteSessionsByUserIdAndOrg(id, req.orgId!)

    req.log.info({ targetUserId: id, actorId: req.user?.id }, "user deleted by admin")
    res.status(204).send()
  }
)

// Reachable only from the invite flow's 409 response above - re-inviting a
// deleted user's email surfaces its id, and the admin confirms restoring it.
// Platform-level (restoreUser undoes a global soft delete); the active org's
// membership is then reactivated, or created if this is a new org for them.
usersRouter.post(
  "/users/:id/restore",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const user = await restoreUser(id)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const existingMembership = await findMembership(id, req.orgId!)
    const defaultRole: UserRole = "staff"
    const membership = existingMembership
      ? ((await updateMembership(existingMembership.id, { isActive: true })) as OrgMembership)
      : await createMembership({ userId: id, orgId: req.orgId!, role: defaultRole })

    const emailResult = await sendWelcomeEmail(req.orgId!, user, req.user!, membership.role)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, emailStatus: emailResult.status },
      "user restored by admin"
    )
    res.json({ user: adminUser(user, membership), email: emailResult })
  }
)
