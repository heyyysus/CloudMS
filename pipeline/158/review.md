# Plan review — issue #158

## Findings

- Scope matches the issue exactly: schema column, three send call sites, `agencyIdentity`, env/docs cleanup, no admin UI/API (correctly out of scope per the issue body).
- File/line references all check out against the current tree: `schema.ts:51-62` (organizations block, #157's columns present), `mailer.ts`'s `process.env.MAIL_REPLY_TO` read and conditional `reply_to` spread, `jobs/config.ts:45`'s `agencyIdentity(org: { name: string })`, `emails.ts:99`/`274` `sendEmail` calls, `routes/mail.ts:65`, `repositories/organizations.ts:9` `findOrganizationById`, `mailer.test.ts:69`'s existing MAIL_REPLY_TO test, `docs/multitenancy.md:235-236,310`.
- Nullable-no-default column is correct and explicitly contrasted with #157's `NOT NULL DEFAULT` shape — matches the orchestrator note and reproduces today's unset-env behavior.
- The absent-vs-empty-string distinction (criterion 2) is preserved correctly: mailer's existing conditional spread is reused unchanged, and the test plan calls out `"reply_to" in body` over `toBeUndefined()` to catch an accidental explicit `null`.
- Tests use `TestContext`/`ctx.org()`/`ctx.cookie()` per CLAUDE.md, cover null-org (no key), two-orgs-differ (criterion 3), and add reminders coverage for `agencyIdentity`'s email — no truncation or global-count assertions.
- Own-database instructions (`createdb`/`db:push`/`dropdb` against `myapp_158`) match CLAUDE.md's concurrent-agents rule for schema-changing work.
- Direction matches PROJECT.md item 2 (*Mostly done*) and closes the same "Not yet built" bullet and `docs/multitenancy.md` rollout item 6 that #157 left open.
- No security concerns: reply-to is never user-input on the request path (resolved server-side from the org row), and `organizations` is correctly identified as not RLS-protected with all three call sites already inside an org-scoped request/job context.

## Required changes (if rejected)

N/A

Verdict: approved
