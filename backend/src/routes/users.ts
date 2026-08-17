import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { sendWelcomeEmail } from "../emails"
import {
  createUser,
  deleteSessionsByUserId,
  findUserByEmail,
  findUserById,
  listUsers,
  updateUser,
} from "../repositories"
import type { User } from "../types"
import { firstIssue, isPgUniqueViolation, parseId } from "./helpers"
import { inviteUserBody, updateUserBody } from "./schemas"

export const usersRouter = Router()

// `googleSub` is the Google account identifier; it never leaves the server.
// Whether it is set is still useful to an admin - it distinguishes an invited
// user who has never signed in from one who has.
function adminUser(user: User) {
  const { googleSub, ...rest } = user
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

    const existing = await findUserByEmail(email)
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
    if (!user) {
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
