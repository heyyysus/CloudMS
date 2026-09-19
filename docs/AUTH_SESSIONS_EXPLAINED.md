# Auth & Sessions: Repositories and Tests Explained

This document walks through four files from the Google sign-in / DB-backed
sessions feature: the two repository modules that back it
(`repositories/users.ts`, `repositories/sessions.ts`) and the two test files
that exercise them (`repositories/sessions.test.ts`, `auth/auth.test.ts`).

For architectural context: this app uses **opaque, DB-backed session
tokens**, not JWTs. Google is only used for the login handshake — the
backend verifies a Google ID token once, then mints its own random session
token, hashes it, and stores the hash in Postgres. This trades JWT's
statelessness for instant revocability (a session row can be deleted at any
time), which matters more than statelessness here since every request
already hits Postgres and the app handles insurance PII.

---

## `backend/src/repositories/users.ts`

### Purpose

Pure data-access layer for the `users` table — no `req`, no auth awareness,
no authorization logic. This matches the convention documented at the top of
`repositories/index.ts`: repositories only know how to read/write rows;
deciding *who is allowed* to call them is the job of the route/middleware
layer above (`auth/middleware.ts`, `auth/routes.ts`).

### Functions

- **`listUsers()`** — returns every row in `users`. No filtering/pagination;
  fine for the current admin-only, low-row-count use case.
- **`findUserById(id)`** — single-row lookup by primary key, used wherever
  a route already has `req.user.id` (or another user's id) and needs the
  full record.
- **`findUserByEmail(email)`** — the core lookup for login. `auth/routes.ts`
  calls this to implement **invite-only** access: if no row matches the
  Google account's verified email, login is rejected with 403 regardless of
  whether the Google token itself was valid.
- **`createUser(input)`** — inserts and returns the new row via
  `.returning()`. Used by the DB seed script to bootstrap the first
  admin account, and available for an future "manage users" admin UI.
- **`updateUser(id, input)`** — partial update; always stamps `updatedAt` to
  `new Date()` itself so callers never forget to bump it. This is what
  `auth/routes.ts` calls on first login to persist the Google `sub` once a
  user's identity is confirmed (see the `googleSub` binding logic below).
- **`deleteUser(id)`** — deletes by id and returns whether a row was
  actually removed (`deleted.length > 0`), so callers can distinguish "user
  didn't exist" from "user deleted." Because `sessions.user_id` has
  `onDelete: "cascade"` in the schema, deleting a user also deletes all of
  their sessions automatically — no manual cleanup needed here.

### Notable design decisions

- Every function returns `undefined` (not throwing) when a row isn't found,
  so callers explicitly branch on presence — that's what lets
  `auth/routes.ts` turn "no user row" into a clean 403 instead of a 500.
- No email normalization (e.g. lowercasing) happens in this file — the seed
  script inserts emails already lowercased, and Google's `email` claim is
  used as-is. If case-insensitive lookups ever become a problem, that
  normalization belongs here, not scattered across callers.

---

## `backend/src/repositories/sessions.ts`

### Purpose

Pure data-access layer for the `sessions` table, mirroring `users.ts`'s
conventions. This is what turns a session cookie into "yes, this is user X,
until this timestamp."

### Functions

- **`createSession(input)`** — inserts a session row (`userId`, `tokenHash`,
  `expiresAt`) and returns it. Called once per successful login in
  `auth/routes.ts`, with a 7-day expiry (`SESSION_TTL_MS` from
  `auth/tokens.ts`).
- **`findSessionWithUserByTokenHash(tokenHash)`** — the read path hit on
  *every* authenticated request. It does an `innerJoin` against `users` so a
  single query returns both the session row and its owning user, avoiding a
  second round-trip. `requireAuth` (in `auth/middleware.ts`) calls this,
  then separately checks `session.expiresAt` and `user.isActive` in
  application code — the query itself doesn't filter on expiry, it always
  returns the row if the token hash matches, live or expired. That's
  intentional: it lets the middleware distinguish an *expired* session
  (still 401, but could in principle be logged/handled differently) from a
  *nonexistent* one, rather than making both cases look identical.
- **`deleteSessionByTokenHash(tokenHash)`** — used by `POST /auth/logout` to
  invalidate exactly the session the caller is currently using. Returns a
  boolean (`deleted.length > 0`) the same way `deleteUser` does.
- **`deleteSessionsByUserId(userId)`** — revokes *all* sessions for one
  user (e.g. "log out everywhere," or an admin deactivating an account).
  Returns a count instead of a boolean since "how many sessions were killed"
  is meaningful here. Not currently wired to a route, but exists as the
  building block for that feature. This is also the reason
  `sessions.user_id` needed an index (`sessions_user_id_idx`, added in
  migration `0002`) — without it, this query and every cascading delete from
  `users` did a full table scan.
- **`deleteExpiredSessions()`** — deletes every session where `expiresAt` is
  in the past, returning the count deleted. This exists so expired rows
  don't accumulate forever, but as of now **nothing calls it on a schedule**
  — it's a building block for a future cleanup cron/job, not active cleanup.
  Until that's wired up, expired rows are simply ignored by `requireAuth`
  (rejected via the `expiresAt` check) rather than physically removed.

### Notable design decisions

- Tokens are never stored in plaintext. `createSession` is always called
  with `hashToken(token)` (SHA-256, from `auth/tokens.ts`), so a database
  leak alone can't be replayed as a valid session cookie — an attacker would
  also need the original random token, which only ever lives in the
  client's cookie.
- All four "does this exist" mutations (`deleteUser`, `deleteSessionByTokenHash`,
  `deleteSessionsByUserId`, `deleteExpiredSessions`) use `.returning({ id: ... })`
  purely to get a row count/boolean back cheaply, not because the id itself
  is used.

---

## `backend/src/repositories/sessions.test.ts`

### Purpose

Integration tests for `sessions.ts`, run against a real Postgres database
(no mocking) — consistent with the rest of the repository test suite (see
`persons.test.ts` for the pattern this follows).

### Test setup conventions

- **`testEmailPrefix = "sessions-repo-test-"`** — every user created by this
  file uses an email starting with this prefix. `afterEach` then deletes
  `users` matching `LIKE 'sessions-repo-test-%'`, which — because of the
  `ON DELETE CASCADE` from `sessions.user_id` → `users.id` — also deletes
  every session created during the test, without the test needing to clean
  up `sessions` directly. This is the standard cleanup pattern used
  throughout the repository tests, scoped by email prefix so parallel test
  files never collide or clash with real seed data.
- **`makeUser(suffix)`** — helper that creates a throwaway user with a
  unique, descriptive email (e.g. `sessions-repo-test-find@example.com`) for
  each test case.
- **`futureDate()`** — returns "one hour from now," used as a live/non-expired
  `expiresAt` for tests that don't care about expiry specifically.

### Test cases

- **"creates a session and finds it with its user by token hash"** — the
  core round-trip: create a session, then confirm
  `findSessionWithUserByTokenHash` returns both the right session and the
  right joined user.
- **"returns undefined for an unknown token hash"** — confirms the join
  query doesn't error or return a partial row when nothing matches; it
  cleanly returns `undefined`.
- **"deletes a session by token hash"** — deletes once (expects `true`),
  confirms the session is now unfindable, then deletes the same hash again
  (expects `false`) — checking the "already gone" case is distinguishable
  from "successfully deleted."
- **"deletes all sessions for a user"** — creates two sessions for the same
  user, calls `deleteSessionsByUserId`, and checks the count is `2` and that
  one of the two tokens is no longer findable — verifying the bulk delete
  isn't scoped incorrectly (e.g. accidentally deleting only one row).
- **"deletes only expired sessions"** — creates one already-expired session
  and one live session for the same user, then asserts
  `deleteExpiredSessions()` removes the expired one (findable check returns
  `undefined`) while leaving the live one intact (findable check returns
  defined). Uses `toBeGreaterThanOrEqual(1)` rather than an exact count
  since other expired rows could theoretically exist from other tests
  running against the same database.

---

## `backend/src/auth/auth.test.ts`

### Purpose

End-to-end integration tests for the actual HTTP auth flow, using
`supertest` against the real Express `app` (not a mock server) — so these
tests exercise `auth/routes.ts` and `auth/middleware.ts` exactly as they'd
run in production, including real cookie parsing and real Postgres queries.
The only thing mocked is the *external* dependency: Google itself.

### Why `./google` is mocked

```ts
vi.mock("./google", () => ({ verifyGoogleIdToken: vi.fn() }))
```

`auth/google.ts` calls Google's real servers to verify an ID token. Tests
can't (and shouldn't) depend on network access or real Google accounts, so
`verifyGoogleIdToken` is mocked to return whatever `{ email, sub, name }`
identity a given test wants — simulating "Google says this token belongs to
this account" without an actual token or network call. This is exactly why
`google.ts` was written as its own small module in the first place: isolating
the one genuinely un-testable piece (a call to an external service) behind a
function boundary that's trivial to swap out in tests.

### Shared test helpers

- **`testEmailPrefix = "auth-test-"`**, `makeUser`, and the `afterEach`
  cleanup follow the identical pattern from `sessions.test.ts`.
- **`makeSessionCookie(userId, expiresAt?)`** — bypasses the login flow
  entirely to directly mint a valid (or, if `expiresAt` is in the past,
  already-expired) session for a user, returning a `"session=<token>"`
  string ready to pass as a `Cookie` header. Used by every test that needs
  an *already logged-in* user, so those tests aren't re-testing the login
  flow itself.

### `POST /auth/google` tests

- **"logs in an invited user and sets a session cookie"** — the happy path:
  a pre-existing user, Google confirms their email, and the response is a
  200 with the public user shape (`id`, `email`, `name`, `role` — notably
  *not* `googleSub` or timestamps, since `publicUser()` in `routes.ts`
  explicitly whitelists fields) plus a `Set-Cookie` header containing
  `HttpOnly`. It also checks that `findUserByEmail` now shows the user's
  `googleSub` was persisted — confirming the **first-login binding**
  behavior in `routes.ts` (a user row created without a `googleSub` gets it
  filled in on their first successful Google login).
- **"rejects a missing idToken with 400"** — validates the Zod schema
  (`loginSchema`) rejects an empty body before ever calling Google.
- **"rejects an invalid Google token with 401"** — simulates
  `verifyGoogleIdToken` throwing (a bad/expired/forged token) and confirms
  that surfaces as 401, not a 500.
- **"rejects an email with no user row with 403"** — the **invite-only**
  guarantee: a real, valid Google identity with no matching `users` row is
  still refused. Uses a `stranger@example.com` address under the same test
  prefix so it's cleaned up automatically even though no user row is
  actually created for it.
- **"rejects an inactive user with 403"** — a user row exists but
  `isActive: false`, confirming deactivation blocks login even with a
  perfectly valid Google identity.
- **"rejects a Google sub that does not match the stored one with 403"** —
  once a `googleSub` has been bound to a user (simulating a user who has
  logged in before), a login attempt presenting a *different* `sub` for the
  same email is rejected. This guards against account-confusion: without
  this check, if a Google account's email ownership ever changed hands (or a
  differently-provisioned Google Workspace account happened to reuse an
  email), a second, unrelated Google identity could otherwise log in as an
  existing user just by matching the email string.

### `GET /auth/me` tests

- **"returns the current user with a valid session"** — the happy path
  through `requireAuth`.
- **"returns 401 without a cookie"** / **"returns 401 with a garbage
  token"** — both hit the same `requireAuth` branch (no session
  found for the hash of `token`), confirming a missing cookie and a
  syntactically-present-but-invalid one are indistinguishable to a caller
  (no information leak about which case occurred).
- **"returns 401 with an expired session"** — confirms `requireAuth`'s
  explicit `row.session.expiresAt < new Date()` check works, exercising the
  expiry logic without needing `deleteExpiredSessions` to have run first
  (expired rows are still rejected even though they haven't been physically
  deleted from the table).
- **"returns 403 for a deactivated user with a live session"** — an
  important distinction from the 401 cases above: the *session itself* is
  still valid, but the user was deactivated after logging in. `requireAuth`
  checks `user.isActive` on every request (not just at login time), so
  disabling an account takes effect immediately even for users who are
  already holding a live, unexpired session cookie.

### `POST /auth/logout` test

- **"invalidates the session"** — logs out (which deletes the session row
  via `deleteSessionByTokenHash`), then re-uses the *same* cookie against
  `/auth/me` and confirms it now returns 401 — proving logout actually
  revokes server-side state rather than just clearing the client cookie
  (which wouldn't stop a copy of that cookie from still working elsewhere).

### `requireRole` tests

- Builds a tiny standalone Express app (`adminOnlyApp`) with one route
  guarded by `requireAuth, requireRole("admin")`, rather than reusing the
  full `app` — keeping the role-check test isolated from all the other
  routes/middleware.
- **"rejects staff with 403"** / **"allows admins"** — confirms
  `requireRole`'s admin-bypass behavior from `middleware.ts` (`req.user.role
  !== role && req.user.role !== "admin"`): a `staff` user is blocked from an
  `admin`-only route, but an `admin` user is let through even though the
  route was declared as `requireRole("admin")` and their role literally
  equals it anyway — this test doesn't actually distinguish "role matches"
  from "role is admin," since the admin case satisfies both. What it does
  confirm is that admins are never blocked.

---

## Manually Testing the Endpoint

There's no frontend login page yet, so exercising `/auth/google` outside of
the test suite means minting a real Google ID token by hand. Steps:

### 1. Make sure your account is invited

Login is invite-only (`findUserByEmail` in `auth/routes.ts` — no matching
`users` row means 403 even with a perfectly valid Google token). Either:

- run the seed (`npm run db:seed` in `backend/`, which creates
  `jesus.velarde07@gmail.com` as admin), or
- set `ADMIN_EMAIL=<your-google-account-email>` in `.env` and run
  `npm run db:migrate` (the migrate script bootstraps that email as an
  admin user via `onConflictDoNothing`).

### 2. Start the backend

```
cd backend && npm run dev
```

Defaults to port 8000 (`PORT` in `.env` overrides it).

### 3. Get a real Google ID token

Use a throwaway static HTML page with Google Identity Services, served from
the exact origin registered on the OAuth client (e.g. `http://localhost`):

```html
<!-- serve this from http://localhost (e.g. `npx serve -l 80` or python http.server on port 80) -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID"
     data-callback="handleCredentialResponse">
</div>
<div class="g_id_signin" data-type="standard"></div>
<script>
  function handleCredentialResponse(response) {
    console.log("ID TOKEN:", response.credential);
  }
</script>
```

Open it in a browser, click "Sign in with Google," pick the account whose
email matches your invited user, and copy the token logged to the console.
The page must be served from an origin registered as an "Authorized
JavaScript origin" on the Google OAuth client — if you serve on a port other
than what's registered, add that specific `http://localhost:<port>` origin
too.

(Alternative: Google's OAuth Playground, but you'd need to plug in your own
client ID/secret under its "use your own credentials" setting — otherwise
the token's `aud` claim won't match `GOOGLE_CLIENT_ID` and
`verifyGoogleIdToken` will reject it.)

### 4. Exercise the endpoints with curl

Keep a cookie jar so the session cookie persists across requests:

```
curl -c cookies.txt -X POST http://localhost:8000/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken": "<paste the token here>"}'

curl -b cookies.txt http://localhost:8000/auth/me

curl -b cookies.txt -X POST http://localhost:8000/auth/logout

curl -b cookies.txt http://localhost:8000/auth/me   # should now 401
```

Google ID tokens are short-lived (~1 hour) but not single-use, so the same
token can be reused for a few login attempts while testing — mint a fresh
one from the HTML page if it expires, or to re-test the "first-login binds
`googleSub`" vs. "subsequent login" paths in `auth/routes.ts`.
