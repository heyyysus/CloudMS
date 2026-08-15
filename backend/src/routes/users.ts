import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { sendWelcomeEmail } from "../emails"
import { createUser, findUserByEmail } from "../repositories"
import { firstIssue, isPgUniqueViolation } from "./helpers"
import { inviteUserBody } from "./schemas"

export const usersRouter = Router()

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
    res.status(201).json({ user, email: emailResult })
  }
)
