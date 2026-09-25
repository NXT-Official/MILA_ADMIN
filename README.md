# Mila Staff Suite

The admin and moderator interface for Mila. It was extracted from the member app (`../MILA/app`)
so that staff tooling runs on its own origin, with its own deployment and its own attack surface —
the member site contains no link, redirect, or hint that this app exists.

Both apps share **one Supabase project**.

## Stack

TanStack Start (Vite 7 + Nitro) · React 19 · TanStack Router / Query / Table · Tailwind v4 ·
Supabase (auth, Postgres, storage) · Bun.

## Roles and routes

Two roles, one permission map (`src/lib/authorization.ts`). Every screen sits at its own path and
names the one permission that opens it:

| Route                 | Permission                 | Admin | Moderator | Purpose                                           |
| --------------------- | -------------------------- | :---: | :-------: | ------------------------------------------------- |
| `/`                   | —                          |   ✓   |     ✓     | Staff sign-in                                     |
| `/dashboard`          | `admin.dashboard.view`     |   ✓   |     —     | Stats: members, credits, posts, support           |
| `/analytics`          | `analytics.view`           |   ✓   |     —     | Business metrics + table browser                  |
| `/database`           | `database.view`            |   ✓   |     —     | Read-only viewer for every table                  |
| `/shop`               | `shop.view`                |   ✓   |     —     | Catalogue items, links and brands                 |
| `/members`            | `members.view`             |   ✓   |     —     | Grant/revoke roles, suspend, create, edit, delete |
| `/subscription-plans` | `subscriptionPlans.manage` |   ✓   |     —     | Membership plan catalog                           |
| `/moderation`         | `moderation.view`          |   ✓   |     ✓     | Hide / restore / delete feed posts                |
| `/support`            | `support.view`             |   ✓   |     ✓     | Help-desk and feedback triage                     |

Every stat card on `/dashboard` and `/analytics` is a link: dashboard cards open the screen
that manages the number, analytics cards deep-link into the database viewer
(`/database?table=<name>`) for the table behind it.

### The database viewer

`/database` (and the browser embedded on `/analytics`) pages through the newest 50 rows of any
`BROWSABLE_TABLES` entry with a server-side search. Two database facts shape it, both verified
against the live project:

- `ilike` only works on text columns — against uuid, enum, boolean, numeric or jsonb columns
  PostgREST fails with `42883` (operator does not exist). `SEARCH_COLUMNS` therefore lists text
  columns only, and tables with none (`user_roles`, `user_entitlements`) disable the search box.
- Search terms are stripped of `,`, `(`, `)`, `\`, `*` and `"` before they reach `.or()`, because
  those characters are PostgREST filter grammar.

### The shop inventory

`/shop` lists the whole catalogue — image, brand, category, gender, price (with any discount),
stock and verification — and every outbound link the item carries: the affiliate product link,
the brand site and the image URL, each openable and copyable from the item's detail dialog.
Filters (search, category, brand, gender, stock) run server-side against `products`, and the
`Export CSV` button writes the filtered catalogue out with the links included, so the inventory
can leave the console. `SHOP_CSV_COLUMNS` in `src/lib/shop.functions.ts` defines that spreadsheet
layout; brand details are flattened into each row by the embedded `brands` join.

### Deleting a member account

`adminDeleteMember` permanently deletes the auth user (profiles, roles, entitlements, posts and
looks cascade). Two foreign keys on `staff_audit_log` have no delete rule, so the server function:

1. refuses self-deletion and refuses to remove the last active Steward (the same guard as the
   role/suspend RPCs);
2. refuses accounts that have acted as staff — `actor_user_id` is NOT NULL, so those rows cannot
   be re-pointed and the database will not allow the delete; such accounts are revoked and
   suspended instead (the members table disables the action and says why);
3. nulls `target_user_id` for rows written by the role/suspend RPCs before deleting — the id stays
   in `target_id` text, so the audit trail survives;
4. records `member.deleted` with the deleted account's email/name in the audit metadata.

The Supabase admin API answers an FK violation with an empty error object, which is why steps 1–3
are explicit pre-flight checks rather than error-message parsing.

`staffHome(roles)` walks `STAFF_ROUTE_PERMISSIONS` in declaration order and returns the first
route the viewer can open — so an admin lands on `/dashboard` and a moderator on `/moderation`.
The sidebar filters by the same map, so a moderator never sees a link they cannot follow.

### How access is enforced

Three layers, only the last of which actually matters for security:

1. `src/routes/_authed.tsx` — session check plus `admin.access` (the floor for the whole suite).
   Client-only (`ssr: false`), because the Supabase session lives in `localStorage`.
2. Each leaf route's `beforeLoad` calls `requireStaffRoutePermission`, and `StaffShell` re-checks
   per path and renders a "Restricted" panel as a fallback. Without this an `admin.access`
   moderator could deep-link straight into the admin-only screens.
3. **Every staff server function independently calls `assertAdmin` or `assertPermission`**
   (`src/lib/admin.functions.ts`, `src/lib/subscription-plans.functions.ts`) behind the
   `requireSupabaseAuth` middleware, which verifies the bearer JWT and re-checks
   `profiles.suspended` on every call. This holds even if every client guard is bypassed.

A signed-in account with **no** staff role is signed out on the sign-in screen rather than
redirected — redirecting alone would leave this form a working entry point for member credentials.

Every privileged mutation writes a `staff_audit_log` row via `recordStaffAction`.

## Environment

Copy `.env.example` to `.env`. All five values are the same Supabase project as the member app.

| Variable                        | Scope              | Notes                                                       |
| ------------------------------- | ------------------ | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Client             | Supabase project URL                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client             | Anon key                                                    |
| `SUPABASE_URL`                  | Server             | Same project URL                                            |
| `SUPABASE_PUBLISHABLE_KEY`      | Server             | Anon key for the request-scoped RLS client                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server, **secret** | Required — member listing, image signing, and the audit log |
| `VITE_HCAPTCHA_SITEKEY`         | Client             | hCaptcha on the sign-in form                                |
| `HCAPTCHA_SECRET`               | Server, **secret** | hCaptcha verification                                       |

No Paddle, Sanity, AI, or Cloudflare credentials — nothing in this suite calls them. The plan
editor stores Paddle product/price **ids** as plain text columns; it never talks to Paddle.

## Getting started

```bash
bun install
bun run dev        # https://localhost:8081  (the member app runs on 8080)
```

Seeded accounts (from the member app's schema migration):

| Account                   | Role        |
| ------------------------- | ----------- |
| `milaadmin@gmail.com`     | `admin`     |
| `milamoderator@gmail.com` | `moderator` |

## Scripts

| Script              | Purpose                          |
| ------------------- | -------------------------------- |
| `bun run dev`       | Dev server on `:8081`            |
| `bun run build`     | Production build into `.output/` |
| `bun run start`     | Serve the built app              |
| `bun run lint`      | ESLint + Prettier                |
| `bun run typecheck` | `tsc --noEmit`                   |
| `bun test`          | Unit and boundary tests          |

## Relationship to the member app

**The member app owns the database.** `supabase/migrations/` lives in `../MILA/app` and is the
single source of truth for tables, RLS policies and RPCs — including the ones this suite depends
on: `user_roles`, `has_role`, `manage_user_role`, `set_user_suspended`, `staff_audit_log`.
Do not add a `supabase/` directory here.

> **After any migration, regenerate `src/integrations/supabase/types.ts` in _both_ repositories.**
> The file is duplicated, not shared, and a stale copy here fails at runtime, not at build time.

A handful of other files are duplicated by design (the Supabase clients, `cn`/`errorMessage`, the
`ui/` primitives, the login form and captcha hook). Two small apps sharing a few hundred lines is
cheaper than a workspace package linking them; if that stops being true, extract one package
rather than a monorepo.

## Security notes

- Nothing here links back to the member app, and the member app does not link here.
- `X-Robots-Tag: noindex, nofollow` plus a `robots` meta tag; the CSP allows only `'self'`,
  the Supabase origin, Google Fonts, and hCaptcha.
- The browser Supabase client never imports the service-role key — `src/lib/security-boundaries.test.ts`
  asserts this, along with the per-route permission wiring and the sign-out-on-refusal behaviour.
- Suspended staff accounts are blocked by `SuspendedGate` client-side and by
  `requireSupabaseAuth` server-side.

# MILA_ADMIN
