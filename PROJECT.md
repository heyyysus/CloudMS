# Cloud CMS

A cloud-native CMS built for independent insurance agencies.

## Overview

Running an independent insurance agency today usually means juggling a patchwork of tools: a legacy agency management system, spreadsheets for tracking renewals, a separate SMS/email tool for client outreach, and manual re-keying of data between carrier portals. Cloud CMS is meant to replace that patchwork with a single, modern system of record for clients, policies, vehicles, drivers, and carrier relationships.

The project is built around four pillars:

- **Fully cloud-based.** No on-prem servers or desktop software to maintain — agents and staff access the system from anywhere, on any device, with data centralized and backed up by default.
- **AI-assisted.** AI woven into the day-to-day workflow: drafting client communications, summarizing policy documents, assisting with data entry and underwriting review, and surfacing renewal or coverage gaps before they become problems.
- **Integrations.** Native connections into the tools an agency already depends on — carrier rating/quoting APIs, payment processors, e-signature providers — so data flows in and out of the CMS instead of being manually copied between systems.
- **Automated SMS/email.** Built-in, automated client communication — renewal reminders, document requests, policy status updates — sent by text or email without a staff member having to remember to send them.

The AI and automated-communication pillars above describe where the product is headed — they are not yet built, and the integrations pillar so far extends only to VIN decoding against the NHTSA vPIC API and importing TurboRater rater bridge files (.tt2x) by drag-and-drop. The section below describes what exists today.

## Current State

Cloud CMS is early-stage. What's built so far:

**Backend** — a TypeScript API on Express 5, using Drizzle ORM against Postgres, with Vitest/Supertest for testing and ESLint/Prettier for linting and formatting.

**Frontend** — a Vite + React 19 single-page app in TypeScript, talking to the API over `/api/v1`. Routing is `react-router`, server state is TanStack Query, and forms are react-hook-form + zod. The UI is Tailwind CSS v4 with shadcn/ui components vendored into the repo as owned source over Radix primitives, plus lucide icons; `docs/frontend-ui-design.md` covers the design system and its conventions in depth.

Sign-in is Google Sign-In exchanged for the backend's httpOnly `session` cookie, held in an auth context and enforced on protected routes by a `RequireAuth` guard, with dedicated `/login` and `/logout` pages (see `docs/AUTH_SESSIONS_EXPLAINED.md`). Around that sits an authenticated app shell: a sidebar layout, a light/dark/system theme toggle, tabs for the clients you have open (persisted to `localStorage`), and a ⌘K command palette that searches clients and policies. The screens themselves:

- `/home` — a placeholder dashboard; its cards are still stubs
- `/clients/:clientId` — the working screen: a client summary, the client's policies as tabs (each with its vehicles and their coverages, and its rated drivers), the selected policy's append-only log, and the client's invoices, with dialogs to record a payment and to produce a printable receipt/invoice summary

Vehicle entry decodes a VIN against the NHTSA vPIC API to prefill year, make, and model. For quality, oxlint and `tsc` run over the codebase, and Storybook stories double as the test suite — executed in a real Chromium through Vitest's browser mode — alongside a few plain unit tests for the helpers in `src/lib`.

**Domain model** — the data model for the first supported line of business (personal auto) is in place:

- `persons` — a shared record for any individual (named insured, co-insured, or driver), holding name, date of birth, marital status, gender, and relation-to-insured
- `drivers` — driver-specific detail (license number, rating, SR-22) linked 1:1 to a person
- `clients` — a household/account, linking a named insured (and optional co-insured) to mailing/physical addresses, phone numbers, and emails
- `carriers` — the insurance carriers policies are written through
- `autoPolicies` — a policy tying a client to a carrier, with policy number, term dates, and status
- `vehicles` — vehicles on a policy, with coverage limits (BI, PD, UM/UIM, collision, comprehensive, rental, towing)
- `policyDrivers` — the many-to-many link between policies and the drivers rated on them
- `policyLogs` — append-only, per-policy numbered notes recording calls, changes, and other activity, each stamped with its author; accounting activity (invoices and payments, created and voided) writes its own entries here automatically
- `invoices` / `invoiceItems` — policy-scoped charges, where each line item is either a `sweep` (the carrier's share) or an `agency` fee
- `payments` / `receipts` — payments recorded against an invoice, each one minting a receipt
- `trustLedger` — every movement of money in or out of the agency trust account

Accounting follows a trust model: a client pays the agency, the funds sit in the agency's trust account, and once an invoice is paid in full the carrier's share is swept out and the agency keeps its fee. Those records are immutable — corrections are made by voiding, which posts reversing ledger entries rather than editing or deleting rows. `docs/API.md` documents the endpoints.

**Deployment** — Docker Compose orchestrates the stack: nginx, the API container, Postgres, and Redis (still reserved for future caching/queueing work). nginx does double duty — it serves the built frontend as static files and reverse-proxies `/api/v1/` to the API, stripping the prefix. TLS terminates at nginx using a Cloudflare Origin CA certificate with Cloudflare in front of it; Certbot is no longer part of the stack (see `docs/cloudflare-https.md`).

CI/CD runs as two GitHub Actions workflows. `ci.yml` typechecks, lints, format-checks, tests, and builds the backend — path-filtered, so it only runs when backend or infrastructure files change — and deploys to the production host on merge to `main`. `frontend.yml` lints and builds the frontend on changes under `frontend/`, then deploys by rsyncing the built assets to the host and restarting nginx, since the frontend isn't containerized. One gap worth naming: the frontend's Vitest/Storybook suite isn't wired into CI yet — only lint and build run there.

**Not yet built** — none of the AI or automated SMS/email features described above exist in code yet, and third-party/carrier integration so far is limited to VIN decoding and TurboRater rater-file import. The Home dashboard's client/policy/activity summary cards are still placeholders — the only real content there today is the rater-file drop target — and personal auto remains the only line of business modeled. The domain model's `clientPhones`/`clientEmails` tables already capture the contact data those future features will need.

## Direction

Roughly, in order:

1. Turn the Home dashboard into a real landing page — a client list and search — and wire the frontend test suite into CI.
2. Expand the domain model beyond personal auto to additional lines of business.
3. Layer in carrier and third-party integrations so data enters the system without manual re-keying.
4. Add automated SMS/email communication for renewals, document requests, and policy updates.
5. Introduce AI-assisted workflows on top of the above — communication drafting, document summarization, and underwriting/coverage-gap review.
