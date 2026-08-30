# Plan review — issue #98

## Findings

- Scope matches the issue closely: `DEMO_MODE` config, `GET /config`, `POST /auth/demo` mounted only when on, `users.is_demo` column + migration, hiding demo users from `GET /users`, demo-specific session TTL. Everything under "Out of scope" in the issue (blocking outbound creds, frontend, reseed cron, rate limiting) is correctly excluded from the plan too.
- Direction: correctly identified as infra/foundation work rather than product surface on the PROJECT.md roadmap; reasonable to land regardless of roadmap order since it's the stated dependency for #B–#E, and it fits the "fully cloud-based" pillar (separate deployment, same image, one env var).
- Soundness — spot-checked the concrete claims against the current tree, all hold up:
  - `backend/src/jobs/config.ts` (env-read-per-call, `num()` helper) is a real, applicable pattern to mirror for the new `config.ts`.
  - `backend/src/auth/routes.ts` has `cookieOptions` and `publicUser` exactly as described, currently unexported — exporting them instead of duplicating the cookie literal is the right call so `secure` can't drift between login paths.
  - `backend/src/repositories/users.ts`: `visibleToAdmin()` is the single `and(...)` chokepoint feeding `listUsers()`, and `usersRouter.get("/users", ...)` (`src/routes/users.ts:84-87`) is its only consumer — adding `eq(users.isDemo, false)` there is correctly scoped and won't need touching other listings.
  - `adminUser()` (`src/routes/users.ts:26-30`) destructures out only `googleSub`/`deletedAt`/`deletedBy` and spreads the rest, so `isDemo` surfaces in `GET /users` payloads with no extra code — consistent with the plan's recommendation to leave it in.
  - Migration approach is correct and the issue's own wording is wrong: `src/db/migrate.ts` runs Drizzle's generated-folder `migrate()` plus insert-if-absent bootstrapping; DDL comes from `drizzle-kit generate` (`0000`–`0003_*.sql` present, `package.json` has `db:generate`/`db:migrate` scripts). The plan follows the repo and correctly leaves `migrate.ts` unchanged — good catch, already called out under Risks.
  - `User`/`NewUser` are schema-inferred (`src/types/index.ts:73,95`), so no separate type edit is needed once `isDemo` is added to `schema.ts`.
- Minor overstatement, not a soundness problem: the plan cites `src/jobs/reminders.test.ts` as precedent for the dynamic-import test technique. That file does use `await import(...)` for lazy repository imports, but there's no existing precedent anywhere in `backend/src` for `vi.stubEnv` + `vi.resetModules()` re-importing `app` to flip a module-load-time mount decision — this is a genuinely new test pattern. The plan already treats it as a risk (second pg `Pool` from re-importing `src/db/index.ts`) and gives a concrete, low-risk fallback (always mount the router, 404-guard inside it) if it misbehaves, so this doesn't need to block approval.
- Tests: uses `TestContext`/`makeSessionCookie` from `testHelpers.ts`, explicitly avoids `like(users.email, "demo-%")` cleanup in favor of tracking created ids, and avoids asserting global row counts — matches CLAUDE.md's fixture conventions. Extending `makeTestUser`/`TestContext.user` to accept `NewUser` overrides is a small additive change to `src/routes/testHelpers.ts:76,103` and is the only way to create an `isDemo` test user through the existing helper.
- Security: plan is explicit that `DEMO_MODE=true` intentionally allows unauthenticated admin-account creation, and correctly frames this as acceptable only because a demo instance is a fully separate deployment/database — matches the issue's own framing. Adds a startup warning log when demo mode is on. Reuses the exact same session-minting path (`generateSessionToken`/`hashToken`/`createSession`/cookie options) as `/auth/google`, so no new auth surface is invented. No secrets or credentials are introduced.
- No CLAUDE.md convention violations spotted (concurrent-agents section excluded per instructions).

## Required changes (if rejected)

N/A

Verdict: approved
