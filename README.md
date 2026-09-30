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
| `/ai-settings`        | `aiSettings.manage`        |   ✓   |     —     | Styling models, revenue tax, AI cost per call     |
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

### Switching the styling models (`/ai-settings`)

Both model ids behind styling live in the member app's **`platform_settings`** table (single row,
MILA migration `20260929043000_add_platform_settings.sql`). The member app resolves them per
request in `src/lib/platform-settings.server.ts` with a 30-second in-process cache, so saving here
changes the model the next member request uses — no deploy, no restart, both apps stay up.

- **Text & vision model** serves look composition, item detection and colour analysis, so a
  replacement must support images _and_ structured output.
- **Image model** serves the look render, style sheet and photo preview.
- The catalog in `src/lib/ai-models.ts` offers the current DeepSeek/Muse pair plus the
  Claude/GPT-6/Gemini classes of the same generation; a **custom id** is accepted behind the same
  pattern the database `CHECK` enforces (`vendor/model`), so a model released tomorrow can be
  switched on without a code change.
- `SHIPPED_DEFAULTS` here must stay equal to the column defaults in the migration — "Restore the
  shipped models" writes those ids, and one of the tests asserts the pair.

The member app logs every AI call in `ai_spend_log` with the model that actually ran, which is what
makes the per-model and per-call figures on this screen honest across a switch.

### Refunds and plan changes

A member's row menu has **Plan & billing**: refund the latest payment and cancel, downgrade or
switch the subscription. The console calls Paddle directly (`src/lib/paddle.server.ts`) and then
mirrors the result into `subscriptions`, so the member app agrees immediately instead of waiting
for the next webhook.

- Refund = `POST /adjustments` `{ action: "refund", type: "full", transaction_id, reason }` against
  the newest **completed** transaction of the subscription.
- Cancel = `POST /subscriptions/{id}/cancel`. `effective_from: immediately` **only** when refunding
  (a refunded payment must not keep serving the period); otherwise `next_billing_period`.
- Switch = `PATCH /subscriptions/{id}` with the target plan's `paddle_price_id` and
  `proration_billing_mode: "do_not_bill"` — staff are fixing a plan, not charging a card; the
  member app's own checkout stays the billing path. A plan without a Paddle price cannot be
  switched onto, and the dialog says so instead of firing a doomed request.
- The dialog refuses a second refund on a payment Paddle already carries a refund for.
- Every one of these writes `member.billing_updated` to the audit log with the from/to plan,
  the refund id and its status, and the reason (which is also sent to Paddle).
- Refund status is Paddle's own (`approved`, `pending_approval`, …) — the toast reports it rather
  than claiming the money has landed.

### Granting a plan to a member who has none

**Plan & billing** on a member with no live subscription offers a plan picker instead of the Paddle
actions: choose an active plan and grant it. The grant is local by design — Paddle bills through
checkout, so there is no subscription to create there — and it writes:

- a `subscriptions` row with `status: "active"`, no period end, and synthetic ids
  (`manual:<uuid>` for `paddle_subscription_id`, `manual` for the customer id). Nothing Paddle
  sends can ever match them, so the webhook and the sync path never touch a granted plan.
- the plan's `credits_included` into `user_entitlements.ai_credits` — the same write the webhook
  makes on a renewal, so the member sees the allowance immediately rather than at the next reset.

The member app needs no deploy: it resolves the plan from that row at request time, treats it as in
force (daily credits, community verification) and shows it as "Granted — by the Mila team" with a
notice instead of self-serve cancel/resume, because those call Paddle. Granting onto a member who
already has a Paddle subscription is refused — two live rows would compete and the member app reads
the newest one; use the Paddle actions for billed members.

Granted plans can be changed or ended from the same dialog (no Paddle involved either way), and the
console records `member.plan_assigned`, `member.plan_changed` or `member.plan_ended` with the plan,
the credits and the note.

### Manual styling credits

**Add styling credits** on a member's row grants credits through the member app's `grant_ai_credits`
RPC — the same ledger `consume_ai_credit` spends from — with the member's plan entitlement passed
as the daily allowance, exactly as `MILA/src/lib/credits.server.ts` resolves it. A hand-added
credit therefore behaves like a purchased one and survives the daily reset. Each grant writes
`member.credits_granted` with the amount, the note and the resulting balance.

### Revenue: gross, tax, net

`/analytics` opens with a revenue panel: **gross** (completed Paddle transactions), the **tax
deduction** configured on `/ai-settings`, and **net** = gross − tax.

- Gross is read from Paddle, not from `purchases`: nothing in either app writes a purchase row yet
  (checkout runs through Paddle's hosted flow), so summing that table would report a confident zero
  forever. Paddle's `GET /transactions?status=completed` is the money that actually moved.
- The tax is one of two kinds, stored on `platform_settings` and set on `/ai-settings`:
  `percent` (a share of gross) or `amount` (a fixed deduction in currency units). Both are floats;
  the value is rounded to whole cents and **clamped to gross**, so net can never go negative.
- Only `completed` transactions count, only the dominant currency is summed (the rest are reported
  as skipped), and if the payment list is longer than the pages we read, the panel says the totals
  cover the newest payments only.
- Without Paddle keys the panel says revenue is unavailable and why, rather than showing `$0`.

The **cost per call** figures come from `ai_spend_log`: total AI spend ÷ calls logged, overall and
per model, over the same 30-day window (other cards on `/analytics` still show all-time totals).

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

Copy `.env.example` to `.env`. The Supabase values are the same project as the member app; the
Paddle pair is optional and only needed for refunds and revenue reporting.

| Variable                        | Scope              | Notes                                                       |
| ------------------------------- | ------------------ | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Client             | Supabase project URL                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client             | Anon key                                                    |
| `SUPABASE_URL`                  | Server             | Same project URL                                            |
| `SUPABASE_PUBLISHABLE_KEY`      | Server             | Anon key for the request-scoped RLS client                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server, **secret** | Required — member listing, image signing, and the audit log |
| `VITE_HCAPTCHA_SITEKEY`         | Client             | hCaptcha on the sign-in form                                |
| `HCAPTCHA_SECRET`               | Server, **secret** | hCaptcha verification                                       |
| `PADDLE_ENV`                    | Server             | `sandbox` (default) or `production`                         |
| `PADDLE_SANDBOX_API_KEY`        | Server, **secret** | Sandbox Paddle key — refunds and revenue in sandbox         |
| `PADDLE_API_KEY`                | Server, **secret** | Production Paddle key, used when `PADDLE_ENV=production`    |

The Paddle keys are the only outbound credentials this suite uses, and only for `/ai-settings` and
the refund/revenue paths — the plan editor still stores Paddle product/price **ids** as plain text
and never calls Paddle. Without the keys the console runs normally: `/analytics` reports revenue as
unavailable, and the billing dialog refuses a refund with the reason.

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
