import { Request, Response, Router } from "express"
import { requirePlatformOwner, requireSession } from "../auth/middleware"
import { runInOrg } from "../db"
import { generateRowId } from "../db/ids"
import { seedWelcomeTemplate } from "../emails"
import { InviteResult, inviteToOrg } from "../invites"
import { createOrganization } from "../repositories"
import type { Organization } from "../types"
import { firstIssue, isPgUniqueViolation } from "./helpers"
import { createOrganizationBody } from "./schemas"

export const organizationsRouter = Router()

// Thrown inside the runInOrg transaction below to roll back the just-created
// organization row when seating its admin fails - a zero-admin org is worse
// than a 409/failed create, and this is the only writer of that row, so a
// full rollback is simpler than a second, compensating delete.
class InviteFailedError extends Error {
  constructor(public result: Exclude<InviteResult, { kind: "invited" }>) {
    super(result.kind)
  }
}

// Platform-owner-only: creates an organization and seats its first admin in
// one call, since an org with no admin can never be signed into. requireSession,
// not requireAuth - no org context exists yet for this request to bind to.
organizationsRouter.post(
  "/organizations",
  requireSession,
  requirePlatformOwner,
  async (req: Request, res: Response) => {
    const parsed = createOrganizationBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { name, slug, admin } = parsed.data
    const orgId = generateRowId()

    let org: Organization
    let invite: Extract<InviteResult, { kind: "invited" }>
    try {
      ;({ org, invite } = await runInOrg(orgId, async () => {
        const org = await createOrganization({ id: orgId, name, slug })
        // Without this, the invite below 500s - sendWelcomeEmail throws when
        // the org it's sending for has no welcome template yet.
        await seedWelcomeTemplate(orgId)
        const invite = await inviteToOrg(
          orgId,
          { email: admin.email, name: admin.name, role: "admin" },
          req.user!
        )
        if (invite.kind !== "invited") throw new InviteFailedError(invite)
        return { org, invite }
      }))
    } catch (err) {
      if (isPgUniqueViolation(err, "organizations_slug_unique")) {
        res.status(409).json({ error: "An organization with this slug already exists" })
        return
      }
      if (err instanceof InviteFailedError) {
        switch (err.result.kind) {
          case "deleted-email":
            res.status(409).json({
              error: "This email belonged to a deleted user",
              deletedUserId: err.result.deletedUserId,
            })
            return
          case "already-member":
          case "duplicate-email":
            res.status(409).json({ error: "A user with this email already exists" })
            return
        }
      }
      throw err
    }

    req.log.info(
      {
        orgId: org.id,
        adminUserId: invite.user.id,
        actorId: req.user?.id,
        emailStatus: invite.email.status,
      },
      "organization created"
    )
    // `email` mirrors POST /users/invite's response; see docs/API.md.
    res.status(201).json({
      organization: org,
      admin: {
        id: invite.user.id,
        email: invite.user.email,
        name: invite.user.name,
        role: invite.membership.role,
      },
      email: invite.email,
    })
  }
)
