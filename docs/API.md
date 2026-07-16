# API Reference: Clients, Persons, Policies, Vehicles, Carriers, Search

This documents the HTTP API for managing the personal-auto book of business:
clients, persons, auto policies, vehicles, carriers, and cross-entity search.
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
`/vehicles`, `/carriers`) accept or return pagination params (`page`,
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
  `dlNumber`/`rating`/`sr22` are ignored), or requiring `dlNumber` if it
  doesn't — or `{ "kind": "new", "person": {...Person body fields...}, "dlNumber": string, "rating"?: ..., "sr22"?: ... }`,
  which creates the person and driver in the same transaction.

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

## Carriers

Included because policies require a `carrierId` — without a carriers
endpoint there'd be no way to create a policy through the API.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/carriers` | any | `listCarriers()` |
| GET | `/carriers/:id` | any | `findCarrierById(id)`, 404 if missing |
| POST | `/carriers` | any | `name`, `naic` (unique) |
| PATCH | `/carriers/:id` | any | partial |
| DELETE | `/carriers/:id` | **admin** | 409 if the carrier still has policies |

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
`auto_policies.policy_address`. See migration `0003_pg_trgm_search.sql`.

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
