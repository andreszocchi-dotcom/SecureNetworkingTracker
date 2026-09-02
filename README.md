# Secure Networking Tracker

A private networking tracker for the people I want to stay connected with at Berkeley. Each
signed-in user keeps their own list of contacts — name, company, role, where we met, notes, and a
high/medium/low priority — and can create, view, sort, filter, edit, and delete them. Every
contact row is owned by exactly one user, and that ownership is enforced by Postgres Row Level
Security rather than by application code, so one user's data stays invisible to another even if a
request skips the app entirely and calls the public Data API directly.

**Live app:** _(filled in after deployment)_

---

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Technology stack and why](#technology-stack-and-why)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Tests](#tests)
- [Grading evidence](#grading-evidence)
- [Deployment](#deployment)
- [Known limitations and what I would improve next](#known-limitations-and-what-i-would-improve-next)

---

## Features

- **Sign up, sign in, sign out** with email and password via Neon Managed Better Auth.
- **Private contact list** — each user sees only their own contacts.
- **Create, edit, delete** contacts with name, company, role, where we met, notes, and priority.
- **Sort** by name, company, priority, or date added, ascending or descending. Priority sorts
  semantically (high → medium → low), not alphabetically.
- **Filter** by priority, and search across name and company.
- **Persistent** — everything lives in Neon Postgres and survives a refresh, a new tab, or a new
  device.
- **Clear states** — distinct loading, empty, success, and error UI, including a different empty
  state for "no contacts yet" versus "no contacts match your filters".
- **Validation with useful messages** — an empty name or an invalid priority fails safely with a
  message attached to the field that caused it.
- **Responsive** — a sortable table on desktop, stacked cards on mobile, with no horizontal
  scrolling.

## Screenshots

_(filled in after deployment — see [Grading evidence](#grading-evidence))_

## Technology stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 client components in Next.js 16 (App Router) | React for the interactive list and dialogs; the App Router lets the session be read on the server so a signed-out visitor never sees a flash of the contacts page. |
| Backend | Next.js Route Handlers on the Node runtime | A real server layer that holds the validation and the token exchange, deployed as one unit with the frontend so there is no CORS or cross-site-cookie complexity. |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) | An accessible component system — dialogs, selects, and tables that work with a keyboard and a screen reader — that I own in-repo and can restyle, rather than a black-box library. |
| Database | Neon Postgres | Serverless Postgres, so RLS policies and CHECK constraints do the security and validation work in one place. |
| Auth | Neon Managed Better Auth | Users, sessions, and OAuth config live in the same database as the data, so the JWT's `sub` claim can be read directly by RLS policies as `auth.user_id()`. |
| Data access | Neon Data API (PostgREST) via `@neondatabase/neon-js` | HTTP access to Postgres that carries the caller's JWT, so every query runs as that user and RLS applies. |
| Validation | Zod on the server + Postgres CHECK constraints | Two independent layers: Zod produces the friendly message, the constraints are unbypassable. |
| Tests | Vitest (unit + live RLS proof), Playwright (end-to-end evidence) | Fast offline tests a grader can run instantly, plus a live proof that the security boundary actually holds. |
| Hosting | Vercel | First-class Next.js support and per-environment variables. |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Browser — React client components (Tailwind + shadcn/ui)      │
│                                                               │
│  auth:  @neondatabase/auth/next  ──►  /api/auth/*             │
│  data:  fetch('/api/contacts')                                │
│                                                               │
│  Holds no database URL, no API key, no token.                 │
└───────────────────────────┬──────────────────────────────────┘
                            │  same-origin HTTPS + HTTP-only session cookie
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Next.js Route Handlers (Node) — the backend                   │
│                                                               │
│  1. auth.getSession()      no session        → 401            │
│  2. Zod validation         bad input         → 400 + field    │
│  3. auth.token()           mint the caller's JWT              │
│  4. neon-js client bound to THAT user's JWT                   │
│                                                               │
│  No service key. No DATABASE_URL. Never queries as an admin.  │
└───────────────────────────┬──────────────────────────────────┘
                            │  Authorization: Bearer <user JWT>
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Neon Data API (PostgREST)                                     │
│  verifies the JWT, sets the `authenticated` role,             │
│  exposes the `sub` claim as auth.user_id()                    │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Neon Postgres — the trust boundary                            │
│  RLS on contacts, 4 policies: auth.user_id() = user_id        │
│  CHECK constraints: name non-blank, priority in (high|medium|low)
└──────────────────────────────────────────────────────────────┘
```

### Request flow, in words

Take "edit a contact" as the example.

1. The browser sends `PATCH /api/contacts/<id>` with a JSON body. It attaches no credentials of
   its own — the signed, HTTP-only session cookie rides along automatically because the request
   is same-origin.
2. [`src/app/api/contacts/[id]/route.ts`](src/app/api/contacts/[id]/route.ts) calls
   `getAuthedContext()`, which reads and verifies the session. No session means `401`.
3. The body is parsed by `parseContactUpdate` from
   [`src/server/contact-schema.ts`](src/server/contact-schema.ts). A blank name or a priority
   outside the enum returns `400` with a per-field message. Any `user_id` in the payload is
   silently stripped here — ownership is not something a client gets to state.
4. [`src/server/data-api.ts`](src/server/data-api.ts) calls `auth.token()` to mint a short-lived
   JWT for **this** user and builds a `neon-js` client bound to it.
5. The client issues `update(...).eq('id', id)`. Notice there is no `.eq('user_id', ...)`
   anywhere in the codebase: the handler does not filter by user at all.
6. Postgres applies the `contacts_update_own` policy. If the row belongs to someone else it is
   not in the statement's scope, so zero rows are updated and the handler answers `404`.

Step 5 is the design point. A missing ownership filter in application code is the classic way
this kind of app leaks data. Here there is no ownership filter to forget, because the database is
doing it.

### Frontend / backend separation

| | Location | Runs on |
| --- | --- | --- |
| Frontend | [`src/app/sign-in/`](src/app/sign-in/), [`src/app/contacts/`](src/app/contacts/), [`src/components/`](src/components/), [`src/lib/`](src/lib/) | The browser (plus server-rendered shells) |
| Backend | [`src/app/api/`](src/app/api/), [`src/server/`](src/server/) | Node, server-side only |

Everything under `src/server/` imports `server-only`, so if a client component ever imported the
auth instance or the Data API client the build would fail rather than shipping it to the browser.

## Database schema

Defined in [`db/schema.sql`](db/schema.sql) and applied with `npm run db:apply`.

### `public.contacts`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | primary key, `default gen_random_uuid()` | Server-generated. |
| `user_id` | `text` | **not null**, `default (auth.user_id())` | The owner. Taken from the JWT's `sub` claim, never from the client. |
| `name` | `text` | not null, `char_length(btrim(name)) between 1 and 120` | The only required field. The `btrim` is what rejects a whitespace-only name. |
| `company` | `text` | nullable, ≤ 120 chars | |
| `role` | `text` | nullable, ≤ 120 chars | |
| `met_where` | `text` | nullable, ≤ 200 chars | Where we met. |
| `notes` | `text` | nullable, ≤ 2000 chars | |
| `priority` | `text` | not null, `default 'medium'`, `check (priority in ('high','medium','low'))` | The database, not just the UI, restricts the values. |
| `priority_rank` | `int` | generated, stored | `high→0, medium→1, low→2`, so sorting by priority is semantic rather than alphabetical. |
| `created_at` | `timestamptz` | not null, `default now()` | |
| `updated_at` | `timestamptz` | not null, `default now()` | Maintained by a `before update` trigger. |

Also: an index on `(user_id, created_at desc)` for the default listing, and a trigger that
refreshes `updated_at` and pins `user_id` to its previous value on every update.

## Authentication and RLS ownership

**Authentication.** Managed Better Auth stores users and sessions in a `neon_auth` schema in the
same database. Signing in sets a signed, HTTP-only session cookie. The browser never holds a
token it could leak. When the backend needs to talk to the database it calls `auth.token()` to
exchange that cookie for a short-lived JWT scoped to that user.

**The ownership rule, in one line:** a user may only see or change rows where
`auth.user_id() = user_id`.

`auth.user_id()` is a Postgres function provided by Neon that returns the `sub` claim of the JWT
the Data API verified for the current request. It cannot be set by the caller. RLS is enabled on
`contacts`, and there are four separate policies — one per command — all scoped to the
`authenticated` role:

```sql
alter table public.contacts enable row level security;

create policy contacts_select_own on public.contacts
  for select to authenticated using (auth.user_id() = user_id);

create policy contacts_insert_own on public.contacts
  for insert to authenticated with check (auth.user_id() = user_id);

create policy contacts_update_own on public.contacts
  for update to authenticated
  using (auth.user_id() = user_id) with check (auth.user_id() = user_id);

create policy contacts_delete_own on public.contacts
  for delete to authenticated using (auth.user_id() = user_id);
```

Three details worth calling out:

- **`USING` versus `WITH CHECK`.** `USING` decides which existing rows a statement can see or
  target. `WITH CHECK` decides what a row is allowed to look like *after* the write. The update
  policy has both, which is what stops a user from taking a row they legitimately own and
  rewriting `user_id` so it belongs to someone else. Without the `WITH CHECK`, that would be
  allowed.
- **The `NOT NULL` on `user_id`** means an unauthenticated caller — where `auth.user_id()`
  returns null — cannot insert a row at all.
- **The `anonymous` role is granted nothing** on `contacts`, so a Data API request with no token
  reads nothing.

The public `NEXT_PUBLIC_*` URLs are HTTPS endpoints, not credentials. Exposing them is expected:
RLS is what protects the rows behind them, which is exactly what `npm run test:rls` demonstrates.

## Local setup

```bash
git clone https://github.com/andreszocchi-dotcom/SecureNetworkingTracker.git
cd SecureNetworkingTracker
npm install

cp .env.example .env.local     # then fill in the values, see below

npm run db:apply               # creates the table, constraints, and RLS policies
npm run dev                    # http://localhost:3000
```

To get the values for `.env.local`, in the [Neon Console](https://console.neon.tech):

1. Create a project.
2. Open **Auth** and enable Managed Better Auth. Copy the **Auth URL**.
3. Open **Data API** and enable it, choosing Managed Better Auth as the JWT provider and granting
   public schema access. Copy the **Data API URL**.
4. Copy the pooled **connection string** from the project dashboard — this is `DATABASE_URL`, and
   it is only ever used by `npm run db:apply` on your own machine.
5. Generate a cookie secret: `openssl rand -base64 32`.
6. Add `http://localhost:3000` to Managed Better Auth's trusted domains.

Other useful commands:

```bash
npm test          # validation tests, offline, no env needed
npm run typecheck # tsc --noEmit
npm run build     # production build
npm run lint
```

## Environment variables

Names only — real values live in `.env.local`, which is gitignored. See
[`.env.example`](.env.example) for the template.

| Variable | Exposed to the browser? | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_NEON_AUTH_URL` | Public URL, safe | `npm run test:rls` and the evidence scripts, which authenticate directly against Neon Auth to prove RLS holds without going through the app |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | Public URL, safe | The backend's Data API client, and the direct-access RLS proof |
| `NEON_AUTH_BASE_URL` | **No — server only** | `src/server/auth.ts` |
| `NEON_AUTH_COOKIE_SECRET` | **No — server only** | Signs the session cookie |
| `DATABASE_URL` | **No — never deployed** | `db/apply.mjs` only, run locally. It is not set in Vercel. |
| `TEST_USER_A_EMAIL` / `_PASSWORD` | Local tooling only | Two-account privacy test |
| `TEST_USER_B_EMAIL` / `_PASSWORD` | Local tooling only | Two-account privacy test |
| `E2E_BASE_URL` | Local tooling only | Which deployment the evidence run drives |

No secret is committed. `.gitignore` excludes every `.env*` file except the placeholder template,
and the browser bundle is checked for leaks — see [Grading evidence](#grading-evidence).

## Tests

### `npm test` — backend validation (offline, no configuration)

27 tests against [`src/server/contact-schema.ts`](src/server/contact-schema.ts), the module every
write passes through. They verify that:

- an empty, whitespace-only, missing, or over-length **name is rejected** with the message
  `Name is required.`
- **priority** accepts only `high`, `medium`, and `low`, and rejects `urgent`, `HIGH`, `""`, and
  non-strings with a message naming the allowed values
- a `user_id` in the payload is **stripped**, so a client cannot assign a contact to another user
  through the API
- unknown fields such as a forced `id` are stripped
- blank optional fields normalise to `null` rather than empty strings
- **sort and filter inputs are whitelisted** — `?sort=user_id` is rejected rather than passed to
  the query builder

### `npm run test:rls` — the two-account privacy proof (needs `.env.local`)

[`tests/rls-two-user.test.ts`](tests/rls-two-user.test.ts) signs in two real accounts and queries
the Data API **directly, bypassing this app's backend**, the way a determined user could from a
browser console. It asserts that:

- A can read the contact A created, and it is stamped with A's user id
- B listing all contacts does not include A's row, and asking for it by exact id returns nothing
- every row B can see belongs to B
- B updating A's row affects zero rows, and A's row is unchanged afterwards
- B deleting A's row affects zero rows, and A's row still exists afterwards
- B cannot insert a row owned by A (the insert `WITH CHECK`)
- A cannot reassign their own row to B (the update `WITH CHECK`)
- a client with no session reads no contacts at all

Because it never touches `/api/contacts`, a pass is evidence about the database, not about my
code being careful.

### `npm run evidence` — end-to-end walkthrough

Playwright drives the deployed app with both test accounts and saves the screenshots below.

## Grading evidence

_(filled in after deployment)_

## Deployment

_(filled in after deployment)_

## Known limitations and what I would improve next

_(filled in after deployment)_
