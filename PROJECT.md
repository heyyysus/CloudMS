# Cloud CMS

A cloud-native CMS built for independent insurance agencies.

## Overview

Running an independent insurance agency today usually means juggling a patchwork of tools: a legacy agency management system, spreadsheets for tracking renewals, a separate SMS/email tool for client outreach, and manual re-keying of data between carrier portals. Cloud CMS is meant to replace that patchwork with a single, modern system of record for clients, policies, vehicles, drivers, and carrier relationships.

The project is built around four pillars:

- **Fully cloud-based.** No on-prem servers or desktop software to maintain — agents and staff access the system from anywhere, on any device, with data centralized and backed up by default. One multitenant deployment serves every agency; an agency is an organization in the database, not an instance to provision (see `docs/multitenancy.md`).
- **AI-assisted.** AI woven into the day-to-day workflow: drafting client communications, summarizing policy documents, assisting with data entry and underwriting review, and surfacing renewal or coverage gaps before they become problems.
- **Integrations.** Native connections into the tools an agency already depends on — carrier rating/quoting APIs, payment processors, e-signature providers — so data flows in and out of the CMS instead of being manually copied between systems.
- **Automated SMS/email.** Built-in, automated client communication — renewal reminders, document requests, policy status updates — sent by text or email without a staff member having to remember to send them.

The AI and automated-communication pillars above describe where the product is headed — they are not yet built, and the integrations pillar so far extends only to VIN decoding against the NHTSA vPIC API and importing TurboRater rater bridge files (.tt2x) by drag-and-drop. The section below describes what exists today.

## Current State

Cloud CMS is early-stage. What's built so far:

**Backend** — a TypeScript API on Express 5, using Drizzle ORM against Postgres, with Vitest/Supertest for testing and ESLint/Prettier for linting and formatting.

**Frontend** — a Vite + React 19 single-page app in TypeScript, talking to the API over `/api/v1`. Routing is `react-router`, server state is TanStack Query, and forms are react-hook-form + zod. The UI is Tailwind CSS v4 with shadcn/ui components vendored into the repo as owned source over Radix primitives, plus lucide icons; `docs/frontend-ui-design.md` covers the design system and its conventions in depth.

Sign-in is Google Sign-In exchanged for the backend's httpOnly `session` cookie, bound to an active organization, held in an auth context and enforced on protected routes by a `RequireAuth` guard, with dedicated `/login` and `/logout` pages (see `docs/AUTH_SESSIONS_EXPLAINED.md`). A session with more than one active org membership lands on a login org picker (`SelectOrg`, `components/auth/org-picker.tsx`) before it can bind; a bound session can switch orgs from a sidebar switcher (`components/layout/org-switcher.tsx`). Around that sits an authenticated app shell: a sidebar layout, a light/dark/system theme toggle, tabs for the clients you have open (persisted to `localStorage`), and a ⌘K command palette that searches clients and policies. The screens themselves:

- `/home` — a placeholder dashboard; its cards are still stubs
- `/clients/:clientId` — the working screen: a client summary, the client's policies as tabs (each with its vehicles and their coverages, and its rated drivers), the selected policy's append-only log, and the client's invoices, with dialogs to record a payment and to produce a printable receipt/invoice summary
- `/admin`, `/admin/users`, `/admin/carriers`, `/admin/correspondence`, `/admin/reminders`, `/admin/trust-accounting` — admin-facing screens for org users/carriers, trust-ledger review, and reminder/correspondence-template management

Vehicle entry decodes a VIN against the NHTSA vPIC API to prefill year, make, and model. For quality, oxlint and `tsc` run over the codebase, and Storybook stories double as the test suite — executed in a real Chromium through Vitest's browser mode — alongside a few plain unit tests for the helpers in `src/lib`.

**Organizations** — an agency is an organization in the database: `organizations` (name, slug, `next_invoice_number`, `next_receipt_number`) and `org_memberships` (linking a user to an org with a role, unique per user/org pair) let one user belong to multiple organizations. Every tenant-owned table carries `org_id`, and a carrier's NAIC and a policy's policy number are unique per organization rather than globally. Isolation is two layers: every repository function takes `orgId` as its first argument and filters by it (layer 1), and Postgres row-level security is the backstop (layer 2), enforced through the `db` (non-superuser `app` role, `DATABASE_URL`) vs `adminDb` (owner role, `DATABASE_ADMIN_URL`) split — `adminDb` is reserved for schema push, bootstrap/seed, and the reminder planner/dispatcher. Every row id (primary key and foreign key alike) is 128 random bits rendered as an opaque, unpadded 22-character base64url string, generated both DB-side and Drizzle-side, so no id anywhere leaks creation order or row count. See `docs/multitenancy.md`.

**Domain model** — the data model for the first supported line of business (personal auto) is in place:

- `persons` — a shared record for any individual (named insured, co-insured, or driver), holding name, date of birth, marital status, gender, and relation-to-insured
- `drivers` — driver-specific detail (license number, rating, SR-22) linked 1:1 to a person
- `clients` — a household/account, linking a named insured (and optional co-insured) to mailing/physical addresses, phone numbers, and emails
- `carriers` — the insurance carriers policies are written through
- `autoPolicies` — a policy tying a client to a carrier, with policy number, term dates, and status
- `vehicles` — vehicles on a policy, with coverage limits (BI, PD, UM/UIM, collision, comprehensive, rental, towing)
- `policyDrivers` — the many-to-many link between policies and the drivers rated on them
- `policyLogs` — append-only, per-policy numbered notes recording calls, changes, and other activity, each stamped with its author; accounting activity (invoices and payments, created and voided) writes its own entries here automatically
- `policyLogAttachments` — files an attachment under a log, so opening a log shows the documents that belong to it; staff link files by hand from the Attachments subtab, and the change form, invoice, and receipt PDFs the server generates link themselves to the log the same action wrote. Unlike the two sides it joins, a link can be removed
- `invoices` / `invoiceItems` — policy-scoped charges, where each line item is either a `sweep` (the carrier's share) or an `agency` fee
- `payments` / `receipts` — payments recorded against an invoice, each one minting a receipt
- `trustLedger` — every movement of money in or out of the agency trust account
- `emailTemplates` / `emailLog` — org-authored, merge-field-driven correspondence templates (plus the singleton `welcome` invite email), and every send's outcome
- `reminderRules` / `scheduledEmails` — standing rules that schedule a template send off a policy date (e.g. a renewal reminder), and the resulting per-occurrence send queue

Accounting follows a trust model: a client pays the agency, the funds sit in the agency's trust account, and once an invoice is paid in full the carrier's share is swept out and the agency keeps its fee. Those records are immutable — corrections are made by voiding, which posts reversing ledger entries rather than editing or deleting rows. `docs/API.md` documents the endpoints.

**Correspondence and reminders** — automated email ships today: `backend/src/mailer.ts` sends through Resend, and `backend/src/jobs/{planner,dispatcher,scheduler}.ts` plan and dispatch reminder-rule sends with leader election and `FOR UPDATE SKIP LOCKED`, so running several app containers needs no extra configuration. Staff can also send one-off correspondence from an admin-authored template. Automated SMS and AI-assisted communication remain future work.

**Deployment** — Docker Compose orchestrates the stack: nginx, the API container, and Postgres. nginx does double duty — it serves the built frontend as static files and reverse-proxies `/api/v1/` to the API, stripping the prefix. TLS terminates at nginx using a Cloudflare Origin CA certificate with Cloudflare in front of it; Certbot is no longer part of the stack (see `docs/cloudflare-https.md`). This is the one and only deployment: every agency is an organization inside it, and there is no per-agency stack, host, or database (see `docs/multitenancy.md`).

CI/CD runs as two GitHub Actions workflows. `ci.yml` typechecks, lints, format-checks, tests, and builds the backend — path-filtered, so it only runs when backend or infrastructure files change — and deploys to the production host on merge to `main`. `frontend.yml` lints and builds the frontend on changes under `frontend/`, then deploys by rsyncing the built assets to the host and restarting nginx, since the frontend isn't containerized. The frontend's Vitest/Storybook suite runs there too: `frontend.yml` installs Chromium and runs `npm test` between lint and build.

**Not yet built** — automated email ships today (see **Correspondence and reminders** above), but automated SMS and AI-assisted features described above don't exist in code yet, and third-party/carrier integration so far is limited to VIN decoding and TurboRater rater-file import. The Home dashboard lists the org's clients with a search box and a rater-file drop target; policy and activity summaries are not built. Personal auto remains the only line of business modeled. The domain model's `clientPhones`/`clientEmails` tables already capture the contact data those future features will need.

Multi-tenancy's remaining pieces (see `docs/multitenancy.md`):

- **Organization creation and first-admin bootstrap.** Inviting a user into an org that already exists ships today as `POST /users/invite`; what's missing is a route that creates the organization and seats its first admin.
- **Organization settings columns**, to retire the last agency-level environment variable — `MAIL_REPLY_TO`.
- **A demo org** living in the same deployment.

## Direction

Roughly, in order:

1. **Done (#152).** Turn the Home dashboard into a real landing page — a client list and search. The frontend test suite already runs in CI (see **Deployment** above).
2. **Mostly done (#117, #119, #120, #121, #122, #130).** Make the app multitenant so it can be released to more than one agency. Shipped: an `organizations` table, `org_id` on every tenant-owned row, organization-scoped repositories, row-level security as the backstop, per-organization invoice and receipt numbering, and opaque row ids. What is left is listed under **Not yet built** above; the full plan is `docs/multitenancy.md`.
3. Expand the domain model beyond personal auto to additional lines of business.
4. Layer in carrier and third-party integrations so data enters the system without manual re-keying.
5. Add automated SMS communication for renewals, document requests, and policy updates — email is done, see **Correspondence and reminders** above.
6. Introduce AI-assisted workflows on top of the above — communication drafting, document summarization, and underwriting/coverage-gap review.
