---
issue: 20
status: pending-review
---
# Surface drivers with no DL number (schema constraint already relaxed)

## Goal

"Done" means an agency can record a driver on a policy without a driver's
license number **through the UI**, end to end, and can then see at a glance
which drivers are missing one.

Concretely:

1. Submitting the add/edit policy form with a blank DL field succeeds (today it
   almost certainly 400s — see below) and stores `drivers.dl_number` as NULL.
2. A driver with no DL number is visibly flagged wherever drivers are listed or
   shown: the policy card's Drivers list, the driver detail dialog, and the
   existing-driver rows inside the add/edit policy form.

Note on the first half of the issue title: **the not-null constraint is already
gone.** Commit `3e75489` ("Make driver dlNumber optional", 2026-07-15) shipped
migration `backend/drizzle/0007_concerned_prism.sql`, made `drivers.dlNumber`
nullable in `backend/src/db/schema.ts:229`, made `dlNumber` optional on both
branches of `createPolicyDriver` (`backend/src/routes/schemas.ts:96-113`) and
optional in `linkPolicyDrivers` (`backend/src/repositories/autoPolicies.ts`),
with tests and `docs/API.md` updated. So the DB/API half of this issue is done;
what remains is the client side, plus one loose end the backend change left
behind (blank-string handling), plus the UI flag the issue asks for.

## Scope check

Fits PROJECT.md's "system of record for clients, policies, vehicles, drivers"
foundation — this is domain-model/UI polish on the personal-auto line that
already exists, not new pillar work. It is not on the numbered Direction list
(dashboard → more lines of business → integrations → SMS/email → AI), but it is
small correctness/UX work on the `/clients/:clientId` screen, which PROJECT.md
calls "the working screen". The prospect-client motivation in the issue lines up
with the "AI-assisted / coverage-gap surfacing" direction only loosely; treat
this as a standalone fix.

Triage labels (`agent`, `pipeline:needs-plan`) look right for routing. Worth
noting for the reviewer that the issue as written reads like backend work, and
is mostly *not* — a `backend`-flavoured label would be misleading.

## Files / areas

Backend:

- `backend/src/routes/schemas.ts` — `createPolicyDriver`: treat a blank/whitespace
  `dlNumber` as "not provided" instead of rejecting it.
- `backend/src/routes/policies.test.ts` — add coverage for blank `dlNumber` on
  POST and PATCH (there is already an "allows adding a driver without a
  dlNumber" test at line 248 that omits the key entirely).
- `docs/API.md` (~lines 222-231) — document that an empty `dlNumber` string is
  treated as absent.

Frontend:

- `frontend/src/api/policies.ts` — `CreatePolicyDriverBody`: make `dlNumber`
  optional on the `kind: 'new'` branch too, and fix the now-stale comment on the
  `existing` branch ("required by the server when the person has no drivers row
  yet" — it isn't, any more).
- `frontend/src/components/clients/add-policy-dialog.tsx` — `toBody` (lines
  ~347-382): omit `dlNumber` when blank rather than sending `''`; existing-driver
  row rendering (lines ~1030-1055): show the missing-DL flag.
- `frontend/src/components/clients/policy-card.tsx` (Drivers list, lines
  ~116-130) — flag on each driver row.
- `frontend/src/components/clients/driver-detail-dialog.tsx` (line 54) — replace
  the bare `'—'` for DL Number with an explicit "Not on file" treatment.
- Stories (these are the frontend test suite): `policy-card.stories.tsx`,
  `driver-detail-dialog.stories.tsx`, `add-policy-form.stories.tsx`.

No change needed in `frontend/src/lib/integration-file.ts` (TurboRater import
already defaults `dlNumber` to `''`) or `import-quote-dialog.tsx` — both feed the
form, and the fix lands in `toBody`.

## Approach

1. **Reproduce the blank-string bug first.** `toBody` sends
   `dlNumber: driver.dlNumber.trim()`, i.e. `''`, for a new driver or an
   existing person with no drivers row; the server schema is
   `z.string().trim().min(1).max(50).optional()`, so `''` fails `min(1)` and the
   whole policy create/update 400s. Confirm with a backend test before changing
   anything — if it already passes, drop step 2 and keep only the frontend
   omission.

2. **Backend leniency** in `backend/src/routes/schemas.ts`, shared by both
   branches of the discriminated union:

   ```ts
   // A form client sends "" for a DL it doesn't have; that means "not on
   // file", not an invalid value.
   const optionalDlNumber = z
     .string()
     .trim()
     .max(50)
     .optional()
     .transform((value) => (value === "" ? undefined : value))
   ```

   Use it for `dlNumber` on both the `existing` and `new` members. Leaving
   `undefined` (not `null`) keeps `CreatePolicyDriverInput` in
   `backend/src/repositories/autoPolicies.ts` unchanged — Drizzle already writes
   NULL for an undefined `dlNumber` in `linkPolicyDrivers`.

3. **Frontend: stop sending blanks.** In `toBody`, reuse the local `nullableTrim`
   idea but for omission — build the driver spec with `dlNumber` spread in only
   when non-empty, e.g.
   `...(trimmed ? { dlNumber: trimmed } : {})`, for both the `existing`
   (no-driver-row) and `new` branches. Then relax `dlNumber` to optional on the
   `new` branch of `CreatePolicyDriverBody` in `frontend/src/api/policies.ts`.
   The form schema at lines 188/210 already allows blank and needs no change.

4. **The UI flag.** Keep it one small shared piece of markup rather than three
   ad-hoc ones — a `MissingDlBadge` (or similar) colocated with the driver
   components, using the existing semantic `--warning` token documented in
   `docs/frontend-ui-design.md` (`text-warning`), a lucide icon
   (`TriangleAlert` or `IdCardLucide`-style) and an accessible label so it is not
   colour-only:
   - `policy-card.tsx`: render it next to `formatNameLastFirst(...)` inside the
     driver `<button>` when `policyDriver.driver.dlNumber` is null/blank. Keep
     the row's existing `ROW_CLASS` layout; the button already has an
     `aria-label`, so extend that label (e.g. `… — no DL number on file`) rather
     than nesting extra interactive elements.
   - `driver-detail-dialog.tsx`: `<Row label="DL Number" …>` renders "Not on
     file" in `text-warning` when `dlNumber` is null.
   - `add-policy-dialog.tsx`: the existing-driver row already renders
     `DL {field.dlNumber}` when `field.hasDriverRow && field.dlNumber`; add the
     `hasDriverRow && !field.dlNumber` case showing the same flag, so staff can
     see which of the client's existing drivers are missing one while picking
     drivers for a policy.

   Use `cn(...)` and existing tokens only — no new colours, no new `ui/`
   component (there is no `badge.tsx` in `frontend/src/components/ui/`; a plain
   `<span>` with token classes matches how `STATUS_TEXT_CLASS` is used in
   `policy-card.tsx:72`).

5. **Docs.** Update the `dlNumber` paragraph in `docs/API.md` to say a blank
   string is accepted and stored as NULL.

## Tests

Backend (`cd backend && npx vitest run`, uses `TestContext` from
`src/routes/testHelpers.ts` — unique-suffixed fixtures, `ctx.cleanup()`, no
truncation, no `db:seed`):

- `policies.test.ts`: POST `/policies` with `drivers: [{ kind: "new", person: …,
  dlNumber: "" }]` → 201 and `driver.dlNumber === null`.
- `policies.test.ts`: POST with `{ kind: "existing", personId, dlNumber: "   " }`
  for a person with no drivers row → 201, `dlNumber === null`.
- `policies.test.ts`: PATCH `/policies/:id` with a blank `dlNumber` → 200, same
  assertion (PATCH shares `createPolicyDriver`).
- Existing tests at `policies.test.ts:248` and
  `repositories/autoPolicies.test.ts:112` should keep passing unchanged.

Frontend (`cd frontend && npm run lint && npm run build`; Storybook stories run
in Chromium via `npm test`, note PROJECT.md's caveat that this suite is **not**
wired into CI yet, so run it locally):

- `driver-detail-dialog.stories.tsx`: add a story with `dlNumber: null` asserting
  the "Not on file" text is rendered.
- `policy-card.stories.tsx`: a driver with `dlNumber: null` shows the flag; one
  with a DL does not.
- `add-policy-form.stories.tsx`: extend the existing submit-payload assertion
  (~line 235) with a case where the DL field is left blank, asserting the
  submitted driver object has **no** `dlNumber` key (`expect.not.objectContaining`
  / explicit `toBeUndefined`).

## Touches backend

**yes** — `backend/src/routes/schemas.ts` plus `policies.test.ts`. (If step 1
shows blank strings are already accepted, this drops to frontend + docs only and
the answer becomes no; state which in the PR.)

No migration is needed — `drivers.dl_number` is already nullable
(`backend/drizzle/0007_concerned_prism.sql`), so no `migrate.ts` run is required
for this change.

## Risks / open questions

- **There is no way to add a DL number to an existing driver later.** This is the
  biggest gap and it is the natural next step of the issue's own motivation (a
  prospect becomes a client and finally hands over their licence). Today
  `toBody` deliberately sends only `{ kind: 'existing', personId }` for a person
  who already has a `drivers` row, and the server ignores `dlNumber` in that case
  by design — asserted in `repositories/autoPolicies.test.ts:98-108` and
  documented in `docs/API.md:224-226`. There is no `/drivers` route at all.
  Fixing it means either a new `PATCH /drivers/:id` endpoint or changing the
  documented replace-all driver semantics; both are bigger than this issue.
  **Recommendation: file a follow-up issue** ("edit a driver's DL number / SR-22
  after creation") and link it. Reviewer: say if you want it folded in here
  instead — it would roughly double the size.
- The blank-string 400 in step 1 is inferred from reading the zod schema
  (`.trim().min(1)` rejects `''`), not from a run — the sandbox on this planning
  runner blocked executing a scratch script. The plan therefore starts by
  proving it with a test.
- Colour alone must not carry the meaning; make sure the flag has text or an
  `aria-label`, and check it in both light and dark themes per
  `docs/frontend-ui-design.md`.
- Cosmetic-only risk otherwise: a missing DL is a normal state for a prospect,
  so the flag should read as informational (warning amber), not as an error
  (destructive red) — don't let it look like the record is broken.

## Out of scope

- Editing/backfilling a DL number on an existing driver (see above — follow-up).
- Any validation of DL format, per-state DL rules, or requiring a DL once a
  policy moves from `pending` to an active status.
- A client- or agency-level "drivers missing DL" report or dashboard card.
- Changing `persons`/`drivers` schema, the replace-all PATCH semantics, or the
  TurboRater import mapping.
- Wiring the frontend Storybook suite into CI (separate, already-named gap in
  PROJECT.md).
