# API Reference: Clients, Persons, Policies, Vehicles, Policy Logs, Carriers, Accounting, Search, VIN decode

This documents the HTTP API for managing the personal-auto book of business:
clients, persons, auto policies, vehicles, policy logs, carriers,
cross-entity search, and VIN decoding.
It complements [`AUTH_SESSIONS_EXPLAINED.md`](./AUTH_SESSIONS_EXPLAINED.md),
which covers login/session mechanics and the `admin`/`staff` role model in
depth — this doc assumes that context and focuses on the resource routes.

## Conventions

- **Mounting**: routers are mounted at the app root (e.g. `GET /clients`, not
  `GET /api/v1/clients`) — nginx strips the `/api/v1` prefix before
  proxying to the backend, matching the existing `/auth/*` routes.
- **Auth**: every route below requires a valid `session` cookie
  (`requireAuth` — see `auth/middleware.ts`). There is no anonymous access.
- **Roles**: `staff` and `admin`. Admins pass every `requireRole` check
  (admin-bypass), so the tables below only call out where a route is
  restricted beyond plain authentication.
- **Response shape**: list/detail endpoints return the repository row shape
  (or a repository's existing joined/"with details" shape) directly — none
  of these tables hold secrets, unlike `users`/`sessions`, so no field
  whitelisting is needed.
- **Errors**: `{ "error": string }`. Status codes:
  - `400` — request body/query failed validation (Zod)
  - `401` — no/invalid/expired session
  - `403` — authenticated but wrong role
  - `404` — no row with that id
  - `409` — a Postgres constraint would be violated (duplicate unique value,
    or a foreign key still referencing the row being deleted)
  - `500` — unexpected error (logged server-side, no detail leaked to the client)

## Auth for frontend clients

Session auth is cookie-based, not a bearer token — see
[`AUTH_SESSIONS_EXPLAINED.md`](./AUTH_SESSIONS_EXPLAINED.md) for the full
mechanics. What a frontend integration needs to know:

- The `session` cookie is `httpOnly`, so client-side JS cannot read it — the
  browser just needs to send it automatically. Any `fetch`/`axios` call to
  these endpoints **must** set `credentials: "include"` (fetch) or
  `withCredentials: true` (axios), or the cookie won't be sent and every
  request will 401.
- Login: `POST /auth/google` with `{ idToken }`, sets the cookie. Current
  user: `GET /auth/me`. Logout: `POST /auth/logout`.
- There is no refresh-token flow; a session lasts 7 days and a fresh login
  is required after that (or after 401).

## No pagination

None of the list endpoints below (`/persons`, `/clients`, `/policies`,
`/vehicles`, `/policy-logs`, `/carriers`) accept or return pagination params (`page`,
`cursor`, `limit`, etc.) — they always return the full table. Only the
search endpoints (`?q=`) cap results (10 or 50, see below). A frontend
should not build pagination UI against these list endpoints yet.

## Response shapes

Field names below match the JSON keys returned by the API (camelCase, as
serialized from the Drizzle row types in `src/types/index.ts`). Every bare
row includes `id`, `createdAt`, and `updatedAt` (ISO datetime strings)
unless noted.

- **Person** (bare): `id`, `firstName`, `lastName`, `dateOfBirth` (`"YYYY-MM-DD"`),
  `maritalStatus` (nullable), `gender`, `relationToInsured`, `createdAt`, `updatedAt`.
- **Client** (bare, e.g. from plain `GET /clients`): `id`, `namedInsuredId`,
  `secondNamedInsuredId` (nullable), `mailingAddress` (nullable),
  `physicalAddress` (nullable), `createdAt`, `updatedAt`. **No nested
  objects** — just the foreign key ids.
- **Client detail** (`GET /clients/:id`, and the create/update response):
  the bare Client fields **plus** `namedInsured` (Person),
  `secondNamedInsured` (Person, nullable), `phones` (array of
  `{ id, clientId, phoneNumber, createdAt }`), `emails` (array of
  `{ id, clientId, email, createdAt }`), `policies` (array of bare
  AutoPolicy rows).
- **AutoPolicy** (bare, e.g. from plain `GET /policies`): `id`, `clientId`,
  `carrierId`, `policyNumber`, `policyAddress1`, `policyAddress2`,
  `policyCity`, `policyState`, `policyZip` (all nullable), `effectiveDate`,
  `expirationDate`, `status`, `createdAt`, `updatedAt`.
- **Policy detail** (`GET /policies/:id`): the bare AutoPolicy fields
  **plus** `client` (bare Client), `carrier` (bare Carrier), `vehicles`
  (array of bare Vehicle rows), `policyDrivers` (array of
  `{ id, policyId, driverId, createdAt, driver: { ...driver fields, person: Person } }`).
- **Vehicle** (bare): `id`, `policyId`, `vin`, `make`, `model`, `year`,
  `garagingZip`, ten coverage fields (`coverageBi`, `coveragePd`,
  `coverageUmbi`, `coverageUmpd`, `coverageCdw`, `coverageMedpay`,
  `coverageColl`, `coverageComp`, `coverageRentalReimbursement`,
  `coverageTowing`, all nullable strings), `createdAt`, `updatedAt`.
  These columns are free text; the frontend coverage dropdowns constrain
  entry to a standard set of limit/deductible values defined in
  `frontend/src/lib/coverage-options.ts` (a value outside that list, e.g. one
  entered before the dropdown existed, is still accepted and displayed as-is).
  `coverageCdw` (collision deductible waiver) is presented as a checkbox that
  mirrors the vehicle's `coverageColl` value rather than being entered
  directly: waived stores the current Collision deductible, unwaived stores
  `null`.
- **Carrier** (bare): `id`, `name`, `naic`, `createdAt`, `updatedAt`.

**Important — search results are a different, narrower shape than the
plain list**, not the bare row and not the detail shape:

- `GET /clients?q=` returns the **Client detail shape minus `policies`**:
  bare Client fields + `namedInsured`, `secondNamedInsured`, `phones`,
  `emails` — but no `policies` array. Plain `GET /clients` (no `q`) returns
  bare Client rows with none of that nested data. A frontend list view that
  needs to render an insured's name must branch on whether `q` was passed,
  or always call the client-detail-shaped path.
- `GET /policies?q=` returns a **custom projection**, not a bare
  AutoPolicy row: `{ id, policyNumber, status, effectiveDate,
  expirationDate, clientId, clientName }` — note there is no `carrierId`,
  `policyAddress`, or `createdAt`/`updatedAt` here, and `clientName` (a
  derived `"First Last"` string) doesn't exist anywhere else in the API.
  Plain `GET /policies` (no `q`) returns bare AutoPolicy rows instead.
- `GET /search?q=` returns `{ clients: [...], policies: [...] }` using
  these same two search-result shapes (client-detail-minus-policies, and
  the policy projection), not the bare/detail shapes.

## Persons

`persons` is the shared record for any individual: named insured,
co-insured, or driver.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/persons` | any | `listPersons()` |
| GET | `/persons/:id` | any | `findPersonById(id)`, 404 if missing |
| POST | `/persons` | any | body validated against `createPersonBody` |
| PATCH | `/persons/:id` | any | partial body, `.partial()` of the create schema |
| DELETE | `/persons/:id` | **admin** | 409 if referenced by a client or driver (no cascade) |

Body fields: `firstName`, `lastName`, `dateOfBirth` (`YYYY-MM-DD`),
`maritalStatus` (optional; `single`/`married`/`divorced`/`widowed`/`separated`),
`gender` (`m`/`f`/`other`), `relationToInsured`
(`self`/`spouse`/`child`/`sibling`/`significant-other`/`other-related`/`other`).

Example response (`GET /persons/:id`):

```json
{
  "id": 12,
  "firstName": "Jane",
  "lastName": "Doe",
  "dateOfBirth": "1987-07-22",
  "maritalStatus": "married",
  "gender": "f",
  "relationToInsured": "self",
  "createdAt": "2026-07-14T17:48:07.653Z",
  "updatedAt": "2026-07-14T17:48:07.653Z"
}
```

## Clients

A `clients` row is a household/account: a named insured (+ optional
co-insured), mailing/physical address, phones, emails, and policies.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/clients` | any | `listClients()`; add `?q=` to search instead (see below) |
| GET | `/clients/:id` | any | `getClientWithDetails(id)` — includes `namedInsured`, `secondNamedInsured`, `phones`, `emails`, `policies`; 404 if missing |
| POST | `/clients` | any | creates the client row, then replaces phones/emails if provided |
| PATCH | `/clients/:id` | any | partial; only touches phones/emails if those keys are present |
| DELETE | `/clients/:id` | **admin** | 409 if the client still has policies (no cascade) |

Body fields: `namedInsuredId` (person id, required), `secondNamedInsuredId`
(optional person id), `mailingAddress`, `physicalAddress` (both optional
free text), `phones` (optional `string[]`), `emails` (optional `string[]`).

**Phones/emails are replace-all, not diffed**: omitting `phones` from a
PATCH body leaves existing phone rows untouched; passing `phones: []`
deletes all of them; passing `phones: [...]` replaces the full set. Same
for `emails`. This keeps the write model simple since these rows have no
identity worth preserving beyond their value.

Example response (`GET /clients/:id`, `POST /clients`, `PATCH /clients/:id`,
and `GET /clients?q=` all use this same detail-minus-`policies` shape,
except plain `GET /clients` also includes `policies` and search omits it —
see [Response shapes](#response-shapes)):

```json
{
  "id": 155,
  "namedInsuredId": 229,
  "secondNamedInsuredId": null,
  "mailingAddress": "42 Wallaby Way",
  "physicalAddress": null,
  "createdAt": "2026-07-14T17:48:07.653Z",
  "updatedAt": "2026-07-14T17:48:07.653Z",
  "namedInsured": { "id": 229, "firstName": "Smoke", "lastName": "Tester", "...": "..." },
  "secondNamedInsured": null,
  "phones": [
    { "id": 26, "clientId": 155, "phoneNumber": "555-867-5309", "createdAt": "2026-07-14T17:48:07.653Z" }
  ],
  "emails": [
    { "id": 14, "clientId": 155, "email": "smoke@example.com", "createdAt": "2026-07-14T17:48:07.653Z" }
  ],
  "policies": [
    { "id": 104, "clientId": 155, "carrierId": 140, "policyNumber": "SMOKE-POL-001", "...": "..." }
  ]
}
```

## Auto Policies

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/policies` | any | `listAutoPolicies()`; `?clientId=` filters to one client; `?q=` searches instead |
| GET | `/policies/:id` | any | `getPolicyWithDetails(id)` — includes `client`, `carrier`, `vehicles`, and `policyDrivers` (each with its `driver` and that driver's `person`); 404 if missing |
| POST | `/policies` | any | body validated against `createPolicyBody`; may include nested `vehicles`/`drivers` (see below), created atomically with the policy |
| PATCH | `/policies/:id` | any | partial; may include `vehicles`/`drivers` (replace-all, see below); the whole update — parent fields plus both child collections — runs in one transaction |
| DELETE | `/policies/:id` | **admin** | vehicles and policy-driver links cascade automatically |

Body fields: `clientId`, `carrierId`, `policyNumber` (unique),
`policyAddress1`, `policyAddress2`, `policyCity`, `policyState`, `policyZip`
(all optional), `effectiveDate`, `expirationDate` (`YYYY-MM-DD`), `status`
(optional; `pending`/`active`/`cancelled`/`expired`, default `pending`).

Both POST and PATCH additionally accept:

- `vehicles` (optional array): vehicle objects as in the [Vehicles](#vehicles)
  body fields, minus `policyId` (injected server-side).
- `drivers` (optional array): each entry is either
  `{ "kind": "existing", "personId": number, "dlNumber"?: string, "rating"?: "rated"|"excluded", "sr22"?: boolean }`
  — reusing that person's `drivers` row if one already exists (in which case
  `dlNumber`/`rating`/`sr22` are ignored) — or
  `{ "kind": "new", "person": {...Person body fields...}, "dlNumber"?: string, "rating"?: ..., "sr22"?: ... }`,
  which creates the person and driver in the same transaction. `dlNumber` is
  optional on both branches: an agency may not have a driver's license
  number yet (e.g. a prospect client), so a `drivers` row can be created or
  reused without one. A blank or whitespace-only `dlNumber` is treated the
  same as an omitted one and is stored as `NULL`.

**On PATCH, `vehicles`/`drivers` are replace-all, not diffed**: omitting the
key leaves that collection untouched; `[]` deletes every row in it;
`[...]` replaces the full set (so vehicle row ids change on every PATCH that
includes `vehicles`). Removing a driver only deletes its `policy_drivers`
link — the underlying `drivers`/`persons` rows are never deleted, since a
person may be a client, an insured, or linked to another policy. The parent
field update and both child replacements happen inside one transaction, so a
validation failure (e.g. an unknown `personId`) rolls back the whole PATCH.

Example response (`GET /policies/:id`, `POST /policies`, and
`PATCH /policies/:id` all return this same detail shape):

```json
{
  "id": 104,
  "clientId": 155,
  "carrierId": 140,
  "policyNumber": "SMOKE-POL-001",
  "policyAddress1": null,
  "policyAddress2": null,
  "policyCity": null,
  "policyState": null,
  "policyZip": null,
  "effectiveDate": "2026-01-01",
  "expirationDate": "2027-01-01",
  "status": "pending",
  "createdAt": "2026-07-14T17:48:07.653Z",
  "updatedAt": "2026-07-14T17:48:07.653Z",
  "client": { "id": 155, "namedInsuredId": 229, "...": "..." },
  "carrier": { "id": 140, "name": "SmokeCarrier", "naic": "SMK0000001", "...": "..." },
  "vehicles": [{ "id": 1, "policyId": 104, "vin": "1HGCM82633A123456", "...": "..." }],
  "policyDrivers": [
    {
      "id": 7,
      "policyId": 104,
      "driverId": 3,
      "createdAt": "2026-07-14T17:48:07.653Z",
      "driver": { "id": 3, "personId": 229, "dlNumber": "D1234567", "rating": "rated", "sr22": false, "person": { "id": 229, "firstName": "Smoke", "...": "..." } }
    }
  ]
}
```

Note: `GET /policies?q=` and `GET /policies?clientId=` do **not** return
this shape — see the projection under
[Response shapes](#response-shapes) and the example in the Search section
below.

## Vehicles

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/vehicles` | any | `?policyId=` filters to one policy (`listVehiclesByPolicyId`); omitted, lists all (`listVehicles`) |
| GET | `/vehicles/:id` | any | `findVehicleById(id)`, 404 if missing |
| POST | `/vehicles` | any | body validated against `createVehicleBody` |
| PATCH | `/vehicles/:id` | any | partial |
| DELETE | `/vehicles/:id` | any (no admin restriction) | |

Body fields: `policyId`, `vin` (unique, 17 chars), `make`, `model`, `year`,
`garagingZip`, plus ten optional coverage limit strings: `coverageBi`,
`coveragePd`, `coverageUmbi`, `coverageUmpd`, `coverageCdw`,
`coverageMedpay`, `coverageColl`, `coverageComp`,
`coverageRentalReimbursement`, `coverageTowing`.

## Policy Logs

A `policy_logs` row is a free-text note attached to a policy — staff and
admins use it to record a running history of calls, changes, and other
activity on that policy. **Logs are append-only**: there is no PATCH or
DELETE, only create and list.

Logs come from two places. Most are typed by a staff member through `POST
/policy-logs` below. The rest are written automatically by accounting actions
— creating or voiding an invoice, recording or voiding a payment each append
one (see [Accounting](#accounting)). An auto-written log is an ordinary
`policy_logs` row in every respect: it shares the policy's `logNumber`
sequence and is authored by the user who performed the action, so there is no
`source` flag to filter on. Its body identifies it, e.g. `Invoice #42 created
— total $400.00 (new business sweep $300.00, new business fee $100.00).`

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/policy-logs?policyId=` | any | `listPolicyLogsByPolicyId(policyId)`; `policyId` is required; newest first (`logNumber` descending) |
| POST | `/policy-logs` | any | body validated against `createPolicyLogBody`; 404 if `policyId` doesn't reference a policy |

Body fields: `policyId` (required), `body` (required, 1-5000 characters,
trimmed).

`logNumber` and `authorId` are **never accepted from the client** — the
server assigns them:

- `logNumber` is a counter scoped to the policy, starting at 1 and counting
  up (1, 2, 3, ... independently per `policyId`), computed inside the same
  transaction as the insert.
- `authorId` is always the session user (`req.user.id`) — the log records
  who was actually authenticated when it was created, not a client-supplied
  value.

Example response (`GET /policy-logs?policyId=104`, `POST /policy-logs`):

```json
[
  {
    "id": 9,
    "policyId": 104,
    "logNumber": 2,
    "body": "Sent updated declarations page to the client.",
    "createdAt": "2026-07-15T14:00:00.000Z",
    "author": { "id": 3, "name": "Jane Staff", "email": "jane@example.com" }
  },
  {
    "id": 7,
    "policyId": 104,
    "logNumber": 1,
    "body": "Called the client to confirm garaging address.",
    "createdAt": "2026-07-14T17:48:07.653Z",
    "author": { "id": 3, "name": "Jane Staff", "email": "jane@example.com" }
  }
]
```

Note the `author` field is a small joined object (`id`, `name`, `email`),
not just an `authorId`, and there is no `updatedAt` — logs are immutable
once created, so there is nothing to have been updated.

## Policy Log Attachments

A `policy_log_attachments` row files one policy attachment under one policy
log, so opening a log shows the documents that belong to it. Staff create
these from the Attachments subtab — select one or more files, then pick a
single log — and the server creates them too: the change form, invoice, and
receipt PDFs it generates are linked to the log the same action appended.

Unlike logs and attachments, **links are not append-only**. An association is
an editorial judgement, so any authenticated user may remove any link,
including one somebody else made. Removing a link never touches the log or
the attachment.

Both ends must belong to the same policy. Voided documents follow the same
visibility rule as `GET /policy-attachments`: a link whose attachment is
voided is withheld from staff and returned to admins.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/policy-log-attachments?policyId=` | any | every link on the policy, newest first; `policyId` is required. One call serves every log — filter client-side by `logId` |
| POST | `/policy-log-attachments` | any | body validated against `linkPolicyLogAttachmentsBody`; returns 201 with the created links |
| DELETE | `/policy-log-attachments/:id` | any | `:id` is the **link's** id, not the attachment's; 204, or 404 if unknown |

POST body: `logId` (required), `attachmentIds` (required, 1-50 positive
integers). Many attachments to one log — the shape of the selection UI.
Re-linking a pair that is already linked is a no-op rather than a conflict,
so a double submit is safe. Returns 404 for an unknown `logId` or
`attachmentId`, and 400 when an attachment belongs to a different policy than
the log.

`linkedBy` is **never accepted from the client** — it is always the session
user, and it credits whoever made the link, which is not necessarily the
attachment's uploader.

Example response (`GET /policy-log-attachments?policyId=104`):

```json
[
  {
    "id": 12,
    "logId": 9,
    "createdAt": "2026-07-15T14:05:00.000Z",
    "linkedBy": { "id": 3, "name": "Jane Staff", "email": "jane@example.com" },
    "attachment": {
      "id": 41,
      "policyId": 104,
      "fileName": "Policy Change Form.pdf",
      "description": "Auto-generated summary of this edit",
      "mimeType": "application/pdf",
      "sizeBytes": 41230,
      "isVoided": false,
      "sourceType": "policy_change",
      "sourceId": 104,
      "createdAt": "2026-07-15T14:05:00.000Z",
      "uploadedBy": { "id": 3, "name": "Jane Staff", "email": "jane@example.com" }
    }
  }
]
```

The attachment is embedded rather than referenced so a client can render a
log's documents without also holding the attachments list — and so an admin
still sees a voided document here after it has dropped out of that list. As
everywhere else, `storageKey` is never included; download URLs come from
`GET /policy-attachments/:id/link`.

## Carriers

Included because policies require a `carrierId` — without a carriers
endpoint there'd be no way to create a policy through the API. Reads are open
to any signed-in user because the policy forms need the list to render their
carrier picker; writes are admin-only, since carriers are shared reference
data that policies, invoice items, and the trust ledger all point at.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/carriers` | any | `listCarriers()` — every carrier, active and inactive |
| GET | `/carriers/:id` | any | `findCarrierById(id)`, 404 if missing |
| POST | `/carriers` | **admin** | `name`, `naic` (unique); optional details below |
| PATCH | `/carriers/:id` | **admin** | partial |
| DELETE | `/carriers/:id` | **admin** | 409 if the carrier is referenced anywhere |

Fields: `name` (≤150), `naic` (≤10, unique), `isActive` (default `true`),
`phone` (≤30), `email`, `website`, `producerCode` (≤50), `notes` (≤2000).
Every optional field accepts `null` or `""` and is stored as `NULL`; `email`
and `website` are format-checked. A PATCH leaves any field it omits untouched.

`isActive` is how a carrier is retired: every FK into `carriers` is `ON DELETE
no action`, so a carrier that has ever been used cannot be deleted. An
inactive carrier drops out of the picker for new policies but still displays
on policies already written on it.

Status codes specific to these routes:

- `409` on POST/PATCH — a carrier with that NAIC already exists.
- `409` on DELETE — the carrier is referenced by existing policies or invoices.

## Users

Account administration. Every route here is admin-only. There is no
`DELETE /users/:id`: accounts are disabled, not removed, so the policy logs
and records they authored keep their author.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/users/invite` | **admin** | creates the account and sends the welcome email; body `{ email, name?, role? }` |
| GET | `/users` | **admin** | every user, ordered by id |
| PATCH | `/users/:id` | **admin** | body `{ name?, role?, isActive? }` |
| POST | `/users/:id/resend-welcome` | **admin** | re-sends the welcome email; body `{ email: <result> }` |

User rows from these routes carry `id`, `email`, `name`, `role`, `isActive`,
`hasSignedIn`, `createdAt`, and `updatedAt`. `googleSub` is never exposed;
`hasSignedIn` reports whether it is set, which distinguishes an invited user
who has never signed in from one who has. `email` is not editable — it is the
identity the Google account is matched on, so changing it would orphan the
login rather than rename it.

One guard applies to PATCH:

- `400` — an admin tried to change their own role or disable their own
  account. Renaming yourself is allowed.

That single rule is also what keeps the install from ever losing its last
admin, so there is no separate "last admin" check: `requireAuth` +
`requireRole("admin")` mean the caller is always an active admin, and they can
only ever demote or disable someone else, so they themselves always survive
the change.

Disabling a user deletes their sessions, so they are logged out immediately
rather than at their next request. (`requireAuth` also rejects a disabled user
with `403 Account is disabled`, and `POST /auth/google` refuses them at login,
so both paths are covered even if a session row survives.)

The welcome-email result is never fatal: a mail failure comes back as
`{ status: "failed", error }` alongside a `201`/`200`, because the account
itself was created or updated successfully.

## Accounting

The agency runs a **trust-accounting** model. A client pays the agency, the
money sits in the agency **trust account**, and once an invoice is paid in
full the agency "sweeps" the carrier's share out to the carrier and keeps its
fee. Every transaction is a policy-scoped **invoice** (one or more line items)
plus the **payments** made against it; each payment mints a **receipt**. The
**trust ledger** records every movement of money in/out of the trust account.

All accounting records are **immutable** — there is no PATCH or DELETE.
Corrections are made by **voiding**, which posts reversing trust-ledger entries
rather than editing or deleting rows. Voiding is **admin-only** (both the
invoice and the payment routes); everything else here is open to any
authenticated user. All invoices, payments, and receipts are
listable with just a `clientId` (or a `policyId`), per requirement.

Every one of those writes also appends a [policy log](#policy-logs) describing
it — invoice created, invoice voided, payment recorded, payment voided —
authored by the acting user. The log is written in the same transaction as the
accounting record, so the two cannot disagree: a request that 4xxs (a payment
against a closed invoice, a void refused for having active payments) writes no
log at all.

### Money format

Monetary values are **decimal strings** backed by `numeric(12,2)` columns
(e.g. `"400.00"`). Amounts nested inside a related object (e.g. `payment.amount`
inside a receipt, or `items[].amount` inside an invoice) are canonical decimals
and **may drop trailing zeros** (`"300"` == `"300.00"`); parse before comparing.
Top-level computed fields (`total`, `amountPaid`, `amountApplied`, `changeGiven`,
`amountDueAfter`, trust `balance`) always carry two decimals.

### Invoices

An invoice belongs to a policy and has one or more line items. Each item is one
of two **categories**: `sweep` (the carrier's share — money that leaves trust to
a carrier) or `agency` (the agency's fee). The item `type` fixes the category:

- **sweep** types: `new_business_sweep`, `installment_payment_sweep`, `endorsement_sweep`
- **agency** types: `new_business_fee`, `installment_payment_fee`, `endorsement_fee`

A sweep item defaults its `carrierId` to the policy's carrier (overridable per
item); an agency item never carries a carrier. `status` is `open` (amount still
due), `closed` (paid in full), or `void`. `total`/`amountPaid` are server-managed.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/invoices?clientId=` or `?policyId=` | any | list, newest first; one filter required |
| GET | `/invoices/:id` | any | full detail: items (+carrier), payments, receipts, client, creator |
| POST | `/invoices` | any | `createInvoiceBody`; 404 if `policyId` missing; 201 with detail |
| POST | `/invoices/:id/void` | admin | 409 if it has active (non-voided) payments; void those first |

Create body: `policyId` (required), `note` (optional), `items[]` (min 1) — each
`{ category, type, carrierId?, description?, amount }`. `createdBy` is stamped
from the session user, never accepted from the client.

### Payments & receipts

Recording a payment applies as much as the invoice still owes; any excess is
**change handed back** (recorded on the receipt, never held in trust). When a
payment settles the invoice, the invoice **closes** and the carrier/agency
shares are swept out of trust. Invoices support **installments** — multiple
payments over time until closed. Payment methods: `cash`, `check`,
`credit_card`, `debit_card`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/payments?clientId=` or `?policyId=` | any | list, newest first |
| GET | `/payments/:id` | any | detail with receipt + invoice |
| POST | `/payments` | any | `recordPaymentBody`; 404 unknown invoice; 409 if invoice not `open`; **201 returns the receipt** |
| POST | `/payments/:id/void` | admin | reverses trust entries, reopens the invoice, voids the receipt; 409 if already void |
| GET | `/receipts?clientId=` or `?policyId=` | any | list, newest first |
| GET | `/receipts/:id` | any | receipt detail |

Payment body: `invoiceId`, `method`, `amount` (> 0), `note` (optional, on the
payment), `receiptNote` (optional, on the receipt). `createdBy` is the session
user. A receipt carries `amountApplied`, `changeGiven`, `amountDueAfter`, and
`invoiceClosed` (whether this payment closed the invoice).

### Trust ledger

Every payment/sweep/fee (and their reversals) is a `trust_ledger` row with a
`direction` of `in` or `out`. Balance = sum(in) − sum(out); reversals are
opposite-direction rows that net out automatically.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/trust-ledger?clientId=` or `?policyId=` | any | ledger rows, newest first |
| GET | `/trust-balance?clientId=` or `?policyId=` | any | `{ clientId\|policyId, balance }` |

Entry types: `payment_received` (in), `carrier_sweep` (out, carries `carrierId`),
`agency_fee` (out). A fully collected-and-settled transaction nets the trust
balance back to `0.00`.

## Search

### Method: Postgres trigram (`pg_trgm`)

The searchable fields are mostly **identifiers and short strings** — phone
numbers, emails, policy numbers, names, addresses — where a user is as
likely to type a *fragment in the middle* of the value ("looking up the last
4 of a phone number", "partial policy number") as a prefix or a whole word.
That rules out two tempting alternatives:

- **Prefix trie**: fast for autocomplete, but prefix-only — it can't find
  `"555-1234"` inside `"(310) 555-1234"`. It would also need to be rebuilt
  in-memory on every write and resynced across backend instances, which is
  extra complexity this app doesn't need yet.
- **Postgres full-text search (`tsvector`)**: built for word-boundary
  matching in prose. A partial policy number or a mid-word name fragment
  isn't a "word" in the FTS sense, so it simply wouldn't match.

**`pg_trgm`** indexes every 3-character fragment of a column, so
`col ILIKE '%term%'` becomes an index-backed lookup (via a GIN index)
instead of a sequential scan, and it naturally supports substring matches
anywhere in the value. It's one extension + a handful of indexes, no new
infrastructure, and it upgrades cleanly later (e.g. `similarity()` ranking,
typo tolerance) without an API change.

GIN trigram indexes exist on: `persons.first_name`, `persons.last_name`,
a combined `first_name || ' ' || last_name` expression (so a two-word query
like `"john smi"` matches across both columns), `clients.mailing_address`,
`clients.physical_address`, `client_phones.phone_number`,
`client_emails.email`, `auto_policies.policy_number`, and
`auto_policies.policy_address`. See migration `0000_past_trauma.sql`.

Search input is escaped (`%`, `_`, `\`) before being wrapped in `%...%`, so
a literal `%` or `_` in a search term is treated literally, not as an SQL
wildcard.

### Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/search?q=` | unified search across clients and policies; `q` min length 2; returns `{ clients: [...], policies: [...] }`, up to 10 of each |
| GET | `/clients?q=` | same client match, up to 50 results, client-detail-minus-`policies` shape (see [Response shapes](#response-shapes)) |
| GET | `/policies?q=` | same policy match, up to 50 results, custom projection (see [Response shapes](#response-shapes)) |

**Client match** (name, phone, email, address): named insured's first/last/full
name, co-insured's first/last/full name, any phone, any email, mailing
address, physical address.

**Policy match** (policy number, address): `policyNumber`, `policyAddress`.

`/search` results are lightweight projections for a global search bar (id,
display name/number, and enough context to disambiguate — e.g. a client's
insured names and a matched phone/email; a policy's number, status, and
client name) rather than the full nested detail shape; fetch
`/clients/:id` or `/policies/:id` for the full record.

Example response (`GET /search?q=Doe`):

```json
{
  "clients": [
    {
      "id": 155,
      "namedInsuredId": 229,
      "secondNamedInsuredId": null,
      "mailingAddress": "42 Wallaby Way",
      "physicalAddress": null,
      "createdAt": "2026-07-14T17:48:07.653Z",
      "updatedAt": "2026-07-14T17:48:07.653Z",
      "namedInsured": { "id": 229, "firstName": "Jane", "lastName": "Doe", "...": "..." },
      "secondNamedInsured": null,
      "phones": [{ "id": 26, "clientId": 155, "phoneNumber": "555-867-5309", "createdAt": "..." }],
      "emails": [{ "id": 14, "clientId": 155, "email": "jane@example.com", "createdAt": "..." }]
    }
  ],
  "policies": [
    {
      "id": 104,
      "policyNumber": "SMOKE-POL-001",
      "status": "pending",
      "effectiveDate": "2026-01-01",
      "expirationDate": "2027-01-01",
      "clientId": 155,
      "clientName": "Jane Doe"
    }
  ]
}
```

Note the client entries here have no `policies` array (unlike
`GET /clients/:id`), and the policy entries have no `carrierId`,
`policyAddress`, `createdAt`, or `updatedAt` — just the fields shown above,
plus the derived `clientName`. `GET /clients?q=` returns the same client
shape as a bare array (no `{ clients, policies }` wrapper); `GET
/policies?q=` returns the same policy shape as a bare array.

Example error (`GET /search?q=a`, below the minimum length of 2):

```json
{ "error": "Too small: expected string to have >=2 characters" }
```

## VIN decode

Decodes a VIN into year/make/model so vehicle entry can be prefilled. The
lookup is served by the **NHTSA vPIC API**
(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/:vin`), proxied
through this route rather than called from the browser: it keeps the vendor URL
and response shape out of the client, puts the call behind the same session
auth as everything else, and gives caching one place to live. **Responses are
not cached yet.**

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/vin-decode?vin=` | any | `vin` is required: exactly 17 characters, `A-Z`/`0-9` excluding `I`, `O`, `Q`; lowercase input is upcased before the upstream call |

Status codes specific to this route:

- `200` — the lookup completed. `isValid` says whether vPIC recognized the VIN;
  see below.
- `400` — `vin` missing or malformed (`"A VIN is 17 characters"` / `"Invalid VIN"`).
- `502` — vPIC was unreachable, timed out (5s), or answered with an error status.

**An unrecognized VIN is a `200`, not a `404`** — the response carries
`isValid: false`. A caller can then distinguish "no such VIN" from "the lookup
itself failed" (`502`) without treating both as errors. Fields vPIC couldn't
determine are omitted rather than returned as empty strings.

Example response (`GET /vin-decode?vin=1HGCM82633A123456`):

```json
{ "isValid": true, "year": "2003", "make": "HONDA", "model": "Accord" }
```

Example response for a VIN vPIC can't identify:

```json
{ "isValid": false }
```

## Client email

Sends an email to a client, via **Resend**'s HTTP API (see `backend/src/mailer.ts`).
Admin-only, since it's a free-text send. Recipients are restricted to
addresses already recorded on the client (`client_emails`) — `to` narrows
which of those addresses receive the message, it never adds a new one, so a
compromised session can't turn this into an open relay.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/clients/:clientId/send-email` | admin | body: `{ subject, body, to? }`; `to` (optional) is an array of addresses that must already be on file for the client — omit it to send to every address on file |

Status codes specific to this route:

- `201` — sent. Body is `{ id, to }`, where `id` is the Resend message id and
  `to` is the resolved recipient list.
- `400` — `subject`/`body` missing or invalid, or `to` includes an address not
  on file for this client.
- `404` — no client with that id.
- `422` — the client has no email address on file.
- `502` — Resend was unreachable, timed out (10s), or answered with an error
  status (e.g. rate limited).
- `503` — `RESEND_API_KEY` or `MAIL_FROM` isn't configured on the server.
- `403` — `DEMO_MODE=true` on the server; body `{ error: "Disabled in demo
  mode" }`. A demo instance holds no outbound mail credentials at all, so this
  takes precedence over the `503` above.

Example response (`POST /clients/42/send-email`, body
`{ "subject": "Renewal", "body": "Your policy renews soon." }`):

```json
{ "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794", "to": ["client@example.com"] }
```

## Correspondence templates

Reusable, client-facing email templates, authored by admins and sent by staff
(see "Correspondence sends" below). Distinct from the singleton `welcome`
invite email: these are keyed by id and scoped to `kind = "correspondence"`, so
the welcome template never appears in this list and can never be sent to a
client.

Subject and body may reference `{{mergeField}}` tokens. The allowed names are a
fixed server-side catalog (`CORRESPONDENCE_MERGE_FIELDS` in
`backend/src/emails.ts`), returned alongside the list so an editor's field help
stays in sync; a write naming an unknown field is rejected with a `400`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/correspondence-templates` | staff | returns `{ templates, mergeFields }`. Open to staff because they pick a template when sending — authoring below stays admin-only |
| POST | `/correspondence-templates` | admin | body: `{ name, subject, body }`; the unique `key` is derived from `name` |
| PATCH | `/correspondence-templates/:id` | admin | full replace, same body as POST |
| DELETE | `/correspondence-templates/:id` | admin | `204`. Past sends survive: `email_log.template_key` is a plain column, not an FK |

## Correspondence sends

Sends an admin-authored correspondence template (see above) to a client, scoped
to one policy so the message can merge that policy's details and so the send is
recorded in that policy's log.

Open to **staff** as well as admins, unlike the free-text send above. What
makes that safe is that the sender never supplies wording: `templateId` names
a template, and the server re-renders its subject and body at send time. The
recipients, however, are *not* restricted to the client's on-file addresses —
staff routinely need to copy a lienholder or a colleague — so every address is
written to `email_log` with the acting user in `triggered_by`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/policies/:policyId/merge-fields` | any | resolved merge-field values for this policy, for previewing a template before sending |
| POST | `/policies/:policyId/send-correspondence` | staff | body: `{ templateId, to, cc? }`; `to` is 1–20 addresses, `cc` up to 20. Addresses are lowercased, and an address may not appear in both |

`GET /policies/:policyId/merge-fields` returns `{ values }`, a map keyed by
every name in the correspondence merge-field catalog — the same map the send
route renders the outgoing message with, so a client-side preview matches what
the recipient receives:

```json
{
  "values": {
    "clientFullName": "Jane Doe",
    "clientEmail": "jane@example.com",
    "policyNumber": "POL-100482",
    "carrierName": "Progressive",
    "agentName": "Alex Agent"
  }
}
```

A field the client hasn't given us (say, a phone number) resolves to `""`
rather than null, matching how the renderer treats an unknown token.

Status codes specific to `POST /policies/:policyId/send-correspondence`:

- `201` — sent. Body is `{ id, to, cc, subject }`, where `id` is the Resend
  message id and `subject` is the merge-rendered subject line.
- `400` — `to` empty or over 20, a malformed address, or an address in both
  `to` and `cc`.
- `404` — no policy with that id, or no *correspondence* template with that id.
  The singleton `welcome` template is kind-scoped out of this lookup, so it can
  never be sent to a client.
- `502` / `503` / `403` — as for `/clients/:clientId/send-email` above.

A successful send writes one `email_log` row per address (`to` and `cc` alike)
and appends one entry to the policy's log:

```
Correspondence sent — "Renewal Notice" to jane@example.com; cc spouse@example.com.
```

A failed send still writes its `email_log` rows, with `status: "failed"`, but
appends no policy log entry — the policy's history never claims a message went
out that didn't.

## Automated reminders

Standing rules that send a correspondence template on their own, off a date on
the policy — the "renewal reminder 30 days out" an agency configures once
instead of remembering. Nothing here depends on host cron: an interval timer
inside every app container runs the same pass, and Postgres arbitrates. The
planner takes `pg_try_advisory_xact_lock` so only one container plans per tick,
and the dispatcher claims work with `FOR UPDATE SKIP LOCKED` so every container
can send at once without two of them sending the same message. Running several
app containers needs no extra configuration.

A rule is `enabled = false` when created, so nothing is ever sent before an
admin has read the rule back and turned it on. Rules are unique on
`(trigger, offsetDays)` — two rules at the same offset would send a client two
emails the same morning.

Sends are attributed to a bootstrapped `automation@cloudms.local` user
(`isActive: false`, so it can never sign in), which is what `policy_logs`
requires for its non-null author and what `email_log.triggered_by` records.
`{{agentName}}` is the one merge field that resolves differently than on a
manual send: with no logged-in agent, it renders `AGENCY_NAME`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/reminder-rules` | staff | returns `{ rules }`, each with the template it sends. Open to staff so a policy's Activities tab can name the rule behind a reminder |
| POST | `/reminder-rules` | admin | body: `{ name, offsetDays, templateId, trigger?, enabled? }`. `offsetDays` is days *before* expiration; negative sends after it. `templateId` is looked up scoped to `kind = "correspondence"` |
| PATCH | `/reminder-rules/:id` | admin | partial — `{ enabled }` alone is the common edit |
| DELETE | `/reminder-rules/:id` | admin | `204`. Cascades the rule's queued (unsent) reminders; sends already made survive in `email_log` and the policy log |
| GET | `/scheduled-emails` | any | the agency-wide queue; `?status=pending,failed` filters (comma-separated) |
| POST | `/scheduled-emails/:id/cancel` | staff | `pending` → `cancelled` |
| POST | `/reminders/tick` | admin | runs one plan+dispatch pass synchronously |

Status codes specific to these routes:

- `404` on POST/PATCH `/reminder-rules` — `templateId` names no correspondence
  template. The `welcome` invite answers `404` here too, by design.
- `409` on POST/PATCH `/reminder-rules` — a rule already exists at that
  trigger/offset.
- `409` on cancel — the reminder is no longer `pending` (already sending, sent,
  failed, or cancelled). The guard is in the `UPDATE`'s `WHERE`, so a stale UI
  can't cancel something already in flight.

`POST /reminders/tick` skips the planner election, so an admin who asks for a
pass always gets one rather than "another container was already planning". It
is also the seam for driving the scheduler from outside the process — an
external cron calling this endpoint — with no code change.

With `DEMO_MODE=true`, the scheduler never starts and `POST /reminders/tick`
answers `403 { error: "Disabled in demo mode" }` instead of running a pass.

## Policy activities

What is scheduled to happen on a policy, behind the **Activities** subtab.

The shape is deliberately generic rather than "a list of scheduled emails": the
`id` is namespaced (`"scheduled-email:42"`) and every row carries `kind` and
`source`, so manually created tasks can join this list later without the
contract changing. Today `scheduled_emails` is the only source and every row is
`source: "automation"`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/policies/:policyId/activities` | any | returns `{ activities }` — upcoming *and* already-sent, so the tab shows history rather than emptying out |

An unknown policy id returns `200` with an empty list rather than a `404`; the
tab is a view over a policy the caller already has open.

```json
{
  "activities": [
    {
      "id": "scheduled-email:42",
      "kind": "reminder",
      "title": "30-day renewal reminder",
      "detail": "Renewal Notice",
      "scheduledFor": "2026-09-18T14:00:00.000Z",
      "sentAt": null,
      "status": "pending",
      "source": "automation",
      "cancellable": true,
      "lastError": null
    }
  ]
}
```
