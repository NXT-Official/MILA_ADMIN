---
title: Environments and releases
category: Platform & releases
summary: Live main versus the nicoleDev preview, the one shared database, who merges, and which database migrations are written but not applied yet.
tags: [main, nicoledev, preview, release, migrations, supabase, vercel, merge, environments]
order: 10
updated: 2026-10-07
status: live
---

Mila has two versions running at the same time. Knowing which one a member or a colleague is using explains most "it works for me but not for her" questions.

## The two versions

| | `main` (live) | `nicoleDev` (next release) |
|---|---|---|
| Who uses it | Every member | Testing only |
| Member web app | https://mila-umber.vercel.app | https://mila-nicoledev.vercel.app |
| Admin app | https://mila-admin-tau.vercel.app | https://mila-admin-nicoledev.vercel.app |
| Mobile app | The builds members have installed | Reaches members only through a new app build |
| Database | **Shared** (see below) | **Shared** (see below) |

- **`main` is live.** It is what members use, on the web and through installed mobile builds.
- **`nicoleDev` is the next release.** All new work lands there first. The preview addresses show whatever has been pushed to the `nicoleDev` branch. Work can sit on the branch before it is pushed, so a fix described in this guide may not be on the preview yet.
- A scheduled job on the owner's computer brings new `main` work into `nicoleDev` every 15 minutes while that computer is on, and only after the tests pass. A merge conflict or a failing test stops it until someone merges by hand, so `nicoleDev` normally, but not always, contains everything that is live, plus the new work.

## One shared database

> **Important:** Both versions use **the same Supabase project**: the same member accounts, the same data, the same storage and the same sign-in settings. Only the websites are separate.

That means:

- Anything saved on a nicoleDev preview, such as a member editing her style profile, or staff adding credits once the admin preview has its server key, **changes live data**.
- A member can sign in to either address with the same account.
- Test accounts created on a preview are real accounts in the live database.

Treat every address as live.

## What the nicoleDev previews cannot do

The preview sites' settings were checked on 2026-10-07. They have what the browser needs (the database address, hCaptcha and the payment environment, plus Sanity on the web preview), but:

- **no AI key**, so no AI feature (looks, colour reads, Dupe Hunter, Concierge and the rest) can be tested there;
- **no server-side database key**, so anything that runs on Mila's server with full database access fails there. On the admin preview that includes **staff sign-in itself**: signing in shows "Request protection is temporarily unavailable." and no admin page can be reached. On the member preview it includes charging credits for AI actions, Community posts and member profile pages, the help form and account deletion;
- **no error reporting key**, so no errors from the previews reach Sentry.

Use the member preview to check screens and member sign-in, not AI results or credit changes. The admin preview cannot be used until it has the server key.

## Who merges

- **Only the owner merges `nicoleDev` into `main`.** Merging is what makes the next release live on the web and in the admin app.
- The owner's development copies are set up so work can only be pushed to `nicoleDev`, never straight to `main`. The main developer also works on `main` directly, so `main` can change without a nicoleDev release.
- After a merge, members may need to reload the web app to get the new version.
- **Mobile** changes reach members only when the owner builds a new app and members install it. The build needs the owner's team account.
- **Database migrations** are applied to production separately, by the owner. A merge does not apply them. The new code checks whether each one exists and falls back safely if it does not.

## Database migrations written but not applied

A migration is a file that changes the database's structure. These are in the `nicoleDev` code but were **not applied** to the production database when checked on 2026-10-07 (the tables and functions they create did not exist):

| File | What it enables | Until it is applied |
|---|---|---|
| `20261007120000_saved_products.sql` | **Saved pieces**: the bookmark on recommended products and the Saved pieces page | Bookmarks are hidden; the page says saving is not switched on yet |
| `20261007143000_generation_jobs.sql` | **Generation jobs** for looks, style sheets and portraits: one charge per request, "please wait" with no charge while one runs, refunds for requests the server cut off, results saved privately on the server, and refunds that follow the new rules in Credits and refunds | Looks, style sheets and portraits work as live today |
| `20261007170000_tracked_ai_credit_refunds.sql` | **Tracked refunds** for every other AI feature (Dupe Hunter, colour read, Concierge, Lens, garment detection), so each refund follows the rules in Credits and refunds, including the midnight rule | Refunds from those features keep the live-today credits issue |

The two credit migrations can be applied in either order. Both are needed, together with the merge, for the full rules in [Credits and refunds](/faqs/credits-and-refunds).

One more file, `20260812093000_add_style_goals.sql`, is new to the code but **not** new to the database: the style goals column it describes already exists in production. The file only records it in the code, and it is written to be safe to run on a database that already has it.

### Drafts, not migrations

Some database access changes from the 2026-10-06 audit are **drafts for the owner to review**, not migrations, and no tool applies them automatically. One of them lets a member keep reading the plan she holds after it is hidden or archived; until it is applied, follow the warning in [Subscriptions and plans](/faqs/subscriptions-and-plans). The owner tracks the rest in [Known issues and owner actions](/faqs/known-issues-and-owner-actions).

## Where a member is

- On the web, the address in her browser tells you: `mila-umber` is live.
- On mobile, every member is on the build she installed. A fix on `nicoleDev` reaches her only after an app update.
- Sign-in links started on a preview now return to that preview. Links from anywhere not on the allowed list go to the live site. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

## Related articles

- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
- [Credits and refunds](/faqs/credits-and-refunds)
- [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges)
- [Analytics and error reporting](/faqs/analytics-and-error-reporting)
- [Glossary](/faqs/glossary)
