import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { sendWelcomeEmail } from "../emails"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"
import {
  createUser,
  deleteSessionsByUserId,
  findUserByEmail,
  findUserById,
  listUsers,
  restoreUser,
  softDeleteUser,
  updateUser,
} from "../repositories"
import type { User } from "../types"
import { firstIssue, isPgUniqueViolation, parseId } from "./helpers"
import { inviteUserBody, updateUserBody } from "./schemas"

export const usersRouter = Router()

// `googleSub` is the Google account identifier; it never leaves the server.
// Whether it is set is still useful to an admin - it distinguishes an invited
// user who has never signed in from one who has. deletedAt/deletedBy are
// server bookkeeping only - a deleted user is meant to look gone, not to show
// up in the payload with a timestamp explaining that it isn't, quite.
function adminUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { googleSub, deletedAt, deletedBy, ...rest } = user
  return { ...rest, hasSignedIn: googleSub !== null }
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
    const { email, name, role } = parsed.data

    // includeDeleted so a previously-deleted account's address is offered
    // back as a restore rather than colliding on the unique constraint with
    // no way for the admin to see why.
    const existing = await findUserByEmail(email, { includeDeleted: true })
    if (existing?.deletedAt) {
      res
        .status(409)
        .json({ error: "This email belonged to a deleted user", deletedUserId: existing.id })
      return
    }
    if (existing) {
      res.status(409).json({ error: "A user with this email already exists" })
      return
    }

    let user
    try {
      user = await createUser({ email, name: name ?? null, role })
    } catch (err) {
      if (isPgUniqueViolation(err, "users_email_unique")) {
        res.status(409).json({ error: "A user with this email already exists" })
        return
      }
      throw err
    }

    const emailResult = await sendWelcomeEmail(user, req.user!)

    req.log.info(
      { invitedUserId: user.id, actorId: req.user?.id, emailStatus: emailResult.status },
      "user invited"
    )
    res.status(201).json({ user: adminUser(user), email: emailResult })
  }
)

usersRouter.get("/users", requireAuth, requireRole("admin"), async (_req, res: Response) => {
  const rows = await listUsers()
  res.json(rows.map(adminUser))
})

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
    const { role, isActive } = parsed.data

    // An admin editing their own row may rename themselves, but must not lock
    // themselves out or hand away their own access - the UI hides these too,
    // this is the enforcement.
    //
    // These two checks are also what guarantees the install always keeps at
    // least one active admin, so no separate "last admin" rule is needed:
    // requireAuth + requireRole mean the actor here is always an active admin,
    // and they can only ever demote or disable someone else, so they themselves
    // always survive the change.
    if (id === req.user!.id) {
      if (role !== undefined && role !== req.user!.role) {
        res.status(400).json({ error: "You cannot change your own role" })
        return
      }
      if (isActive === false) {
        res.status(400).json({ error: "You cannot disable your own account" })
        return
      }
    }

    // A deleted user is meant to look gone - not something PATCH can quietly
    // re-enable via isActive: true. Restoring one only happens through the
    // invite flow, above.
    const target = await findUserById(id)
    if (!target || target.deletedAt) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const user = await updateUser(id, parsed.data)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }

    // requireAuth already rejects a disabled user on their next request, but
    // dropping the rows makes the logout immediate and leaves nothing to
    // resurrect if the account is re-enabled later.
    if (isActive === false) await deleteSessionsByUserId(id)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, role, isActive },
      "user updated by admin"
    )
    res.json(adminUser(user))
  }
)

usersRouter.post(
  "/users/:id/resend-welcome",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const user = await findUserById(id)
    if (!user || user.deletedAt) {
      res.status(404).json({ error: "User not found" })
      return
    }

    const emailResult = await sendWelcomeEmail(user, req.user!)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, emailStatus: emailResult.status },
      "welcome email resent"
    )
    res.json({ email: emailResult })
  }
)

// Never a hard delete - see softDeleteUser. To an admin this is meant to look
// permanent: the row disappears from GET /users and can never sign in again;
// the only way back is re-inviting the same email (see POST /users/invite).
usersRouter.delete(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    // Mirrors the self-guard on PATCH: the actor here is always an active
    // admin, and they can only ever delete someone else, so one admin always
    // survives.
    if (id === req.user!.id) {
      res.status(400).json({ error: "You cannot delete your own account" })
      return
    }

    const target = await findUserById(id)
    if (!target || target.deletedAt) {
      res.status(404).json({ error: "User not found" })
      return
    }
    if (target.email === AUTOMATION_USER_EMAIL) {
      res.status(400).json({ error: "This account cannot be deleted" })
      return
    }

    await softDeleteUser(id, req.user!.id)
    // Same reasoning as the isActive: false branch on PATCH - immediate
    // logout rather than waiting for the session to expire.
    await deleteSessionsByUserId(id)

    req.log.info({ targetUserId: id, actorId: req.user?.id }, "user deleted by admin")
    res.status(204).send()
  }
)

// Reachable only from the invite flow's 409 response above - re-inviting a
// deleted user's email surfaces its id, and the admin confirms restoring it.
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

    const emailResult = await sendWelcomeEmail(user, req.user!)

    req.log.info(
      { targetUserId: id, actorId: req.user?.id, emailStatus: emailResult.status },
      "user restored by admin"
    )
    res.json({ user: adminUser(user), email: emailResult })
  }
)
