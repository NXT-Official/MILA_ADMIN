---
title: Glossary
category: Reference
summary: Plain definitions of the words used in this guide, from daily credits and owed refunds to nicoleDev, migrations and RLS.
tags: [glossary, terms, definitions, credits, refunds, release, reference]
order: 10
updated: 2026-10-07
status: live
---

Short definitions of the terms used across this guide, in alphabetical order. Each points to the article with the full story.

## A to C

### Allowance (daily allowance)

The number of daily credits a member's plan gives her each credit day. A member with no plan has an allowance of 0. See [Subscriptions and plans](/faqs/subscriptions-and-plans).

### Already running (in flight)

A request of the same kind is still being worked on for her. After the nicoleDev release, the same request again joins the running one with no new charge; a different one is refused with no charge: on the web with "Mila is still finishing your last request. Try again in a moment.", and in the phone app with "Mila needs a moment. Try again in ...". See [Generations and tab switching](/faqs/generations-and-tab-switching).

### Close match

A Dupe Hunter result scoring 60 to 89 out of 100. Its card line usually starts "A similar ...", or "Similar ..." for pieces named in the plural such as trousers, and never says "Same". See [Dupe Hunter](/faqs/dupe-hunter).

### Credit

What an AI styling action costs, usually one per action. There are two kinds: daily credits and purchased credits. See [Credits and refunds](/faqs/credits-and-refunds).

### Credit day

The day a daily credit belongs to. Credit days follow UTC, so a new one starts at 00:00 UTC, which is 8:00 am Philippine time. "Midnight" in this guide means that moment.

## D to G

### Daily cleanup

A scheduled task that runs every day at 00:05 UTC (8:05 am Philippine time). It refills daily credits for members with a live plan, closes plans that have ended, and (after the nicoleDev release and its generation jobs migration) runs the reaper.

### Daily credits

Credits that come with a plan. Each credit day starts with the full allowance, and unused ones do not carry over. They are always spent before purchased credits.

### Dupe hunt, Dupe Hunter

Dupe Hunter finds affordable look-alikes of a photographed piece in Mila's own shop catalogue. One search is a dupe hunt and costs 1 credit. See [Dupe Hunter](/faqs/dupe-hunter).

### Free visual

The first style sheet or portrait preview after each new look is free. If that free request fails and the server reports it, the free one comes back instead of a credit. If the request was cut off and cleaned up later, it does not come back.

### Garment badge

The small label with an icon and a word in the bottom-left corner of a recommended product photo, saying which piece Mila means, for example "Trousers". See [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges).

### Generation

One of the slow AI requests on the dashboard: Create my look, a style sheet, or a portrait preview.

### Generation job

After the nicoleDev release, the database record that follows one generation from start to finish: what was asked, whether it was charged and from which kind of credit, and the saved result. See [Generations and tab switching](/faqs/generations-and-tab-switching).

## H to M

### hCaptcha

The "are you human" check on sign-in, sign-up and password reset. Supabase checks the answer for the whole project. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

### Identical match

A Dupe Hunter result scoring 90 or more out of 100. Its card says "Same ...". The cut-off is not yet calibrated on real photos, so "identical" means very close in our catalogue, never a promise of the exact product.

### main

The live version of Mila. Members use it at https://mila-umber.vercel.app, and staff use its admin app at https://mila-admin-tau.vercel.app. Only the owner merges the nicoleDev release into it; the main developer also works on it directly. See [Environments and releases](/faqs/environments-and-releases).

### Match quality

Dupe Hunter's overall verdict for a hunt: identical, close, or none.

### Midnight rule

After the nicoleDev release: a daily credit refunded after its credit day rolled over is not added at once. At her next charged action it is added to today's daily credits, but never above the allowance. If today's daily credits are still full, or her plan has ended (allowance 0), nothing is added. See [Credits and refunds](/faqs/credits-and-refunds).

### Migration

A file that changes the database's structure, for example by adding a table. Migrations are applied to production by the owner, separately from merging code. See [Environments and releases](/faqs/environments-and-releases).

## N to R

### nicoleDev

The branch that holds the next release. Its preview addresses are https://mila-nicoledev.vercel.app and https://mila-admin-nicoledev.vercel.app. They use the **same** database as the live site.

### "Nothing close enough yet"

The Dupe Hunter result when no product in our catalogue scored 60 or more against what the AI read from her photo, before her budget and region filters. Usually we just don't stock anything like it yet; sometimes the AI misread the piece.

### Owed refund

After the nicoleDev release: a daily credit refunded after its credit day rolled over, waiting to be settled. It is settled at her next charged action in any feature, under the midnight rule, which may add nothing.

### Purchased credits

Credits that never reset and never expire. Credits staff add with Add styling credits are purchased credits. They are spent after daily credits. Holding any counts her as a paying member. See [Adding styling credits](/faqs/adding-credits).

### Reaper

After the nicoleDev release and its generation jobs migration: the check that finds generation jobs still running 5 minutes 30 seconds after they started, marks them failed and refunds them once. It runs before her next look, style sheet or portrait, and at the daily cleanup. A daily credit refunded at the daily cleanup follows the midnight rule.

### Reconnecting

The web screen (after the nicoleDev release) she sees when her sign-in can't be refreshed, or when she is signed in but her style profile can't be read. She is still signed in, the page comes back by itself, and a failed read never sends her to onboarding. If it happens while she is on a page, she sees a small "Reconnecting. You're still signed in." note instead, and nothing is saved until it clears. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

### Redirect URLs

Supabase's list of addresses a sign-in link or Google sign-in may return to. An address not on the list falls back to the live site.

### Refund

A credit given back automatically when an AI action fails with an error or comes back empty. Each failure is refunded once. Live today a known credits issue is being fixed (see [Credits and refunds](/faqs/credits-and-refunds)). After the nicoleDev release a purchased credit comes back as purchased, and a daily credit spent today comes back to today's daily credits. A daily credit refunded after the 8:00 am reset follows the midnight rule and may add nothing. A request the server was cut off on, or one she left, is not always refunded; see [Generations and tab switching](/faqs/generations-and-tab-switching).

### Refund cap (Dupe Hunter)

After the nicoleDev release: at most 3 refunded empty hunts per member in 24 hours.

### RLS (row level security)

Database rules that decide which rows each signed-in person can read or change. Mila uses them so that, for example, a member can only see her own saved pieces.

## S to Z

### Saved pieces

The bookmark on recommended products and the page that keeps them, arriving with the nicoleDev release. See [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges).

### Sentry

The error-reporting service the apps send crashes and errors to, once its key (the DSN) is set. Nothing is sent without a key. See [Analytics and error reporting](/faqs/analytics-and-error-reporting).

### Similarity score

Dupe Hunter's 0 to 100 measure of how closely a catalogue product matches the piece in her photo, after the nicoleDev release. Products under 60 are not shown.

### Staff audit log

The record of staff actions, such as credit grants, with who did them and when. Stewards can read it in the database browser as `staff_audit_log`. See [Database browser](/faqs/database-browser).

### Steward

The admin staff role. Stewards see every admin page, including Members. See [Members and roles](/faqs/members-and-roles).

### Supabase

The service that holds Mila's database, file storage and sign-in. Live and nicoleDev share one Supabase project.

### UTC

Coordinated Universal Time, the clock Mila's credit days use. 00:00 UTC is 8:00 am in the Philippines.

### Vercel

The hosting service that runs Mila's websites. Live (`main`) and `nicoleDev` each have their own addresses, but they share one database.
