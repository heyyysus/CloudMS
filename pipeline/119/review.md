# Plan review — issue #119

## Findings

- **Security gap: update paths that reassign a parent FK are never org-checked, only creates are.**
  Plan §"Parent checks on insert" (and the issue text itself) scopes parent validation to
  *creating* a child. But `updatePolicyBody`/`updateClientBody`/`updateVehicleBody` are
  `.partial()` of the same `*CoreBody`/`createXBody` schemas used for create
  (`backend/src/routes/schemas.ts:79,166-169,176`), so they still accept `clientId`/`carrierId`
  (policies), `namedInsuredId`/`secondNamedInsuredId` (clients), and `policyId` (vehicles) on
  `PATCH`. The repositories the plan describes for update
  (`updateAutoPolicy`/`updateAutoPolicyWithDetails` in `repositories/autoPolicies.ts:159,177`,
  `updateClient` in `repositories/clients.ts:33`, `updateVehicle` in `repositories/vehicles.ts:24`)
  get only the mechanical treatment — `orgId` added and `and(eq(id), eq(orgId))` on the row
  being updated — with no check that a caller-supplied FK on the *set* side points at a row in
  the same org. Today (single tenant) a bad id 23503s; after this issue, an id that exists but
  belongs to another org satisfies the FK and writes cleanly, silently linking an org-A row to an
  org-B row.
  Combined with the plan's own step 4 decision to leave to-one relations (`client`, `carrier`,
  `namedInsured`) **unfiltered** in `getPolicyWithDetails`/`getClientWithDetails` (justified there
  by "the insert-side parent checks in step 3"), this reopens exactly the hole step 4 assumes is
  closed: org A can `PATCH /policies/:id { clientId: <org B's client id> }` on a policy it owns,
  then `GET` that same policy (org-scoped, so 200) and receive org B's client name/address/
  phone/email back in the unfiltered `client` relation — a direct cross-tenant PII read with no
  guessing beyond an enumerable integer id, reachable by any authenticated staff member. This
  contradicts the issue's rule 2 (parent checks apply to "creating a child" only, but the issue's
  overriding rule 1 promises cross-org access is impossible) and `docs/multitenancy.md`'s stated
  invariant, "Cross-organization lookups do not exist in the API."
  The plan's own wrong-org test template (`plan.md:242`) only PATCHes a non-FK field (`make: "X"`)
  on a row in another org — it never tests PATCHing an *owned* row's FK to point at another org's
  parent, so this path would ship untested as well as unguarded.

## Required changes

- Extend step 3's `CrossOrgReferenceError` parent-check pattern to the update paths that can
  reassign a parent FK, inside the same transaction as the update:
  - `updateAutoPolicy`/`updateAutoPolicyWithDetails` — when `clientId` and/or `carrierId` are
    present in the input, verify they resolve inside `orgId` before/alongside the `SET`, same
    mapping as create (`handlePolicyWriteError`'s `CrossOrgReferenceError` branch already covers
    this once added).
  - `updateClient` — when `namedInsuredId`/`secondNamedInsuredId` are present, same check as
    `createClient`'s.
  - `updateVehicle` — when `policyId` is present, same check as `createVehicle`'s (routes through
    the `app.ts` global `CrossOrgReferenceError` branch).
- Add a wrong-org test per affected route: PATCH an owned row with a FK pointed at a same-shaped
  row that exists in a second `ctx.org()`, and assert it's rejected (400/409, matching the
  existing create-time mapping) rather than succeeding.

Verdict: rejected
