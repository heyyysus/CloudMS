# Cloud CMS

A cloud-native CMS built for independent insurance agencies.

## Overview

Running an independent insurance agency today usually means juggling a patchwork of tools: a legacy agency management system, spreadsheets for tracking renewals, a separate SMS/email tool for client outreach, and manual re-keying of data between carrier portals. Cloud CMS is meant to replace that patchwork with a single, modern system of record for clients, policies, vehicles, drivers, and carrier relationships.

The project is built around four pillars:

- **Fully cloud-based.** No on-prem servers or desktop software to maintain — agents and staff access the system from anywhere, on any device, with data centralized and backed up by default.
- **AI-assisted.** AI woven into the day-to-day workflow: drafting client communications, summarizing policy documents, assisting with data entry and underwriting review, and surfacing renewal or coverage gaps before they become problems.
- **Integrations.** Native connections into the tools an agency already depends on — carrier rating/quoting APIs, payment processors, e-signature providers — so data flows in and out of the CMS instead of being manually copied between systems.
- **Automated SMS/email.** Built-in, automated client communication — renewal reminders, document requests, policy status updates — sent by text or email without a staff member having to remember to send them.

The AI, integrations, and automated-communication pillars above describe where the product is headed — they are not yet built. The section below describes what exists today.

## Current State

Cloud CMS is early-stage. What's built so far:

**Backend** — a TypeScript API on Express 5, using Drizzle ORM against Postgres, with Vitest/Supertest for testing and ESLint/Prettier for linting and formatting.

**Domain model** — the data model for the first supported line of business (personal auto) is in place:

- `persons` — a shared record for any individual (named insured, co-insured, or driver), holding name, date of birth, marital status, gender, and relation-to-insured
- `drivers` — driver-specific detail (license number, rating, SR-22) linked 1:1 to a person
- `clients` — a household/account, linking a named insured (and optional co-insured) to mailing/physical addresses, phone numbers, and emails
- `carriers` — the insurance carriers policies are written through
- `autoPolicies` — a policy tying a client to a carrier, with policy number, term dates, and status
- `vehicles` — vehicles on a policy, with coverage limits (BI, PD, UM/UIM, collision, comprehensive, rental, towing)
- `policyDrivers` — the many-to-many link between policies and the drivers rated on them

**Deployment** — Docker Compose orchestrates the stack: an nginx reverse proxy with Certbot-managed TLS, the API container, Postgres, and Redis (reserved for future caching/queueing work). GitHub Actions runs typecheck/lint/format/test/build on every push and PR, and automatically deploys to the production host on merge to `main`.

**Not yet built** — there is no frontend yet (a Next.js UI is next up), and none of the AI, third-party integration, or automated SMS/email features described above exist in code yet. The domain model's `clientPhones`/`clientEmails` tables already capture the contact data those future features will need.

## Direction

Roughly, in order:

1. Ship a Next.js frontend against the existing API so the CMS is usable end-to-end for managing clients and auto policies.
2. Expand the domain model beyond personal auto to additional lines of business.
3. Layer in carrier and third-party integrations so data enters the system without manual re-keying.
4. Add automated SMS/email communication for renewals, document requests, and policy updates.
5. Introduce AI-assisted workflows on top of the above — communication drafting, document summarization, and underwriting/coverage-gap review.
