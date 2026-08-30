# Plan review — issue #20

## Findings

- Scope is right-sized and the plan's central claim — that the DB/API not-null
  constraint is already gone and what's left is the blank-string 400 plus a UI
  flag — checks out. `backend/src/db/schema.ts:229` (`drivers.dlNumber`) has no
  `.notNull()`, and `backend/src/routes/schemas.ts:102,109` both use
  `.trim().min(1).max(50).optional()`, which does reject `""` as claimed (fails
  `min(1)`, not `optional()`). The plan correctly identifies this as the one
  real bug and gates the backend-schema change on reproducing it with a test
  first — good discipline given the plan's own admission it couldn't run a
  scratch script to confirm.
- Frontend file references are accurate: `add-policy-dialog.tsx:361,377` do
  send `driver.dlNumber.trim()` unconditionally (so `''` when blank), matching
  the described bug; `frontend/src/api/policies.ts:91-92,106` show the stale
  "required by the server" comment on the `existing` branch and a
  non-optional `dlNumber` on the `new` branch, both as described; the
  existing-driver row at `add-policy-dialog.tsx:1035-1037` does gate on
  `field.hasDriverRow && field.dlNumber`, confirming the plan's proposed
  `hasDriverRow && !field.dlNumber` addition is the right complementary case.
- `docs/frontend-ui-design.md:21` confirms `text-warning` is an existing
  semantic token (not a new color), and `policy-card.tsx:72`
  (`STATUS_TEXT_CLASS`) is a real precedent for a plain `<span>` +
  `cn(...)` treatment rather than a new `ui/` component — the plan's "no new
  `badge.tsx`" call is consistent with the codebase.
- `docs/API.md:222-226` and `autoPolicies.test.ts:98-108`/`autoPolicies.ts`
  confirm the plan's "existing driver row ignores submitted `dlNumber`" claim,
  which correctly scopes out "editing a DL on an existing driver" as a
  separate, larger follow-up rather than folding it in here.
- Tests are specified as backend cases using `ctx`/`TestContext` fixtures
  (`ctx.user`, `ctx.policy`, `ctx.person`) consistent with existing tests in
  `policies.test.ts`, and frontend cases as Storybook-suite stories per
  PROJECT.md's testing setup — appropriate for both layers.
- Security/data-exposure surface is minimal and well-handled: no new auth
  paths, the transform only affects how an already-optional field is
  normalized (empty string → undefined → NULL), and the plan explicitly notes
  the flag must not be color-only (accessibility) and must read as
  informational rather than alarming (correct UX judgment for a legitimate
  "not yet provided" state, not an error state).
- Direction fit is honestly self-assessed: the plan acknowledges this isn't on
  PROJECT.md's numbered roadmap and treats it as a standalone correctness/UX
  fix on the existing working screen, which is a reasonable reading rather
  than overclaiming alignment.

## Required changes (if rejected)

N/A

Verdict: approved
