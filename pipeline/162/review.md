# Plan review — issue #162

## Findings

- Scope matches the issue exactly: `POST /organizations` + seat-admin-in-one-call, retiring `ADMIN_EMAIL`/`default-org`, no frontend. Out-of-scope list correctly excludes `POST /organizations/:orgId/admins` and the demo org.
- RLS claim checked against `db/rls.ts:45-54`: `organizations`/`users`/`org_memberships` are indeed in `AUTH_LAYER_TABLES` (unprotected), `email_templates` is in `TENANT_TABLES` (RLS-protected) — so `runInOrg` for the template/invite writes is required and sufficient, no `adminDb` needed.
- Invite lift target verified: `routes/users.ts:52-108` has exactly the deleted-user 409, already-member 409, and welcome-email call the plan says to preserve.
- `ci.yml:99-104` confirms bootstrap's welcome-template comment the plan cites as a risk; plan correctly flags verifying `TestContext.org()` self-seeds before dropping `default-org`.
- `requirePlatformOwner` (middleware) and `runInOrg` (`db/context.ts:16`) both exist as described from #161.
- Risk section (partial-write orphaning a zero-admin org, platform-owner-not-becoming-admin) is well-reasoned and appropriately deferred to implementation with a transaction/cleanup decision, not hand-waved.

## Required changes (if rejected)

N/A

Verdict: approved
