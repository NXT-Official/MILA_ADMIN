---
title: Analytics and error reporting
category: Platform & releases
summary: What the Analytics page shows and which numbers to trust, plus the plain status of error reporting, PostHog, Firebase and email.
tags: [analytics, revenue, sentry, errors, posthog, firebase, email, resend, metrics]
order: 30
updated: 2026-10-07
status: partly-live
---

This article has two parts. The first explains the Analytics page. The second is a plain status list for the tools that watch Mila for errors and usage, because they differ between the live apps and the nicoleDev release.

## Who can use it

The Analytics page is for Stewards only. Moderators do not see it.

## Part 1: the Analytics page

### What it shows

From the top:

1. A one-line note: "Select any card to open the table behind its number. Every table is also browsable below."
2. The **Revenue** panel: Gross, Tax deducted and Net.
3. A grid of number cards.
4. The same table browser as the Database page, at the bottom. The same privacy rules apply. See [Database browser](/faqs/database-browser).

### The Revenue panel

| Figure | Where it comes from |
|---|---|
| Gross | Completed payments read live from Paddle |
| Tax deducted | The tax setting on AI Settings applied to gross. See [AI settings](/faqs/ai-settings) |
| Net | Gross minus the tax. It never goes below zero |

> **Important:** Paddle payments are not live yet, so the panel shows no money. Instead of a number, it says Paddle keys are not set and revenue cannot be read. That is expected today, not an error. It shows no confident zero. See [Subscriptions and plans](/faqs/subscriptions-and-plans).

When Paddle is set up, the panel sums only completed payments in the most common currency, notes when other currencies were left out, and notes when it only covers the newest payments.

### The number cards

Every card is a link. Most open the table behind the number in the database viewer. Some open another page, such as Shop or AI Settings.

| Card | What it counts | Good to know |
|---|---|---|
| Active Subscriptions | Memberships with status active | Includes plans staff granted by hand |
| MRR (estimate) | Monthly recurring revenue from paid plans | Yearly plans count a twelfth each month. See the table below for how the live figure differs |
| Revenue Tax | The current tax setting | Opens AI Settings |
| Looks Generated | All generated looks, one per generation | |
| Concierge Conversations, Concierge Messages | Totals | |
| Saved Palettes | Totals | |
| Catalog Products | Products in the shop | Opens Shop |
| Brands | Brands in the catalogue | |
| Tagged Post Items | Garments tagged inside feed posts | |
| Active Rate-Limit Buckets | A technical counter | Not a business number |
| Total AI Spend | AI cost from the spend log | Only calls that reported a cost add to it. The page reads at most one batch of rows, so on a large log it covers only part of the spend and shows no warning |
| AI Cost per Call | Total spend divided by all calls logged | Spend divided by every call logged. It inherits the one-batch limit, so on a large log it reads too low. The figure on AI Settings covers 30 days and divides only by calls that reported a cost |
| Total AI Tokens | Tokens from the spend log | The same one-batch limit as Total AI Spend |
| Product Events (30d) | Usage events from the apps in the last 30 days | |
| Web vs Mobile Events (30d) | The same, split by app | |
| Top Event (30d) | The most common event name | |

Web vs Mobile and Top Event are counted from at most one batch of events, so on a busy month they can undercount.

| | MRR (estimate) |
|---|---|
| Live today | The figure is about 100 times too high, because plan prices stored in cents are shown as whole currency units. It also counts plans staff granted by hand |
| After the nicoleDev release | Correct. It counts paid plans that are still in force, and leaves out granted plans |

Until the release, do not quote the MRR card to anyone.

Product events come from the apps writing a small record, such as sign-up, onboarding, look generated or purchase started, into a table called `analytics_events`. The Top Event card shows the most common event name and how many times it happened.

## Part 2: error reporting and other tools

### Status at a glance

| Tool | Status | What it means for you |
|---|---|---|
| Sentry in the admin app | Live today: probably on, without cleaning. After the nicoleDev release: on, with cleaning | The live admin app was redeployed on 2026-10-07 to pick up its reporting address (DSN), so it is probably sending reports now. The live admin app uses an older setup, which does not remove member data. The nicoleDev release adds the cleaning below |
| Sentry in the member apps | Built in, being switched on | Mobile builds made from `main` include a Sentry address and report crashes. The web app was redeployed on 2026-10-07 to pick up its address |
| PostHog | Built into the member web and mobile apps | Usage analytics: pages and screens viewed, app opens, clicks on the web, and sign-up, onboarding, look and purchase events, linked to the member's account id. The web app sends events only once its key is set in the deployment, which the code cannot show. Mobile builds made from `main` already include a key. The admin app has no PostHog. See [PostHog and Firebase](#posthog-and-firebase) for what changes with the release |
| Firebase Analytics | Planned, not live | No code exists in any Mila app yet |
| Email (Resend) | Not set up | No domain has been bought, so no mail key exists |
| Paddle payments | Not live | See [Subscriptions and plans](/faqs/subscriptions-and-plans) |

### Sentry in the admin app

Sentry is a service that collects error reports so developers can fix problems. The admin app is built to send errors to it, from both the browser and the server, but it does nothing until two values are set in the deployment: `SENTRY_DSN` for the server and `VITE_SENTRY_DSN` for the browser, where the DSN is the address of the Sentry project. Each side stays off until its own value is set. While a side is off, every reporting call does nothing and the app works normally.

After the nicoleDev release it is built to protect people:

- Only your staff account id is attached to a report. No email, name or other details.
- Email addresses, sign-in tokens, cookies, keys and the network address of your computer are removed before sending.
- Web addresses lose every value that is not a known harmless one. What you type in a search box, in the Database page for example, travels in the address and is removed.
- The labels of buttons and switches you click, which can include a member's name, are removed from the click records.
- Photos and long encoded blobs are removed.
- Session recording is off.
- If cleaning an item fails, the item is dropped instead of sent.

> **Note:** One limit is known. A person's name typed into free text, such as a database message that repeats a value, cannot be recognised as a name and could be sent as written. Do not paste member names into places an error might copy them, and prefer the table's own search.

| | Error reporting |
|---|---|
| Live today | An older, simpler reporting setup. The live app was redeployed on 2026-10-07 to pick up its address, so it is probably sending reports now, and it does not remove search text, emails or names. Until the release, do not type member emails or names into admin search boxes unless you must. The owner action is in [Known issues and owner actions](/faqs/known-issues-and-owner-actions) |
| After the nicoleDev release | Server and browser errors are reported, with the cleaning above |

What to do when you see an error message on screen: note the time, the page and what you pressed, and tell the owner. You do not need to copy any member details.

### PostHog and Firebase

PostHog is built into the member web and mobile apps to show how people use Mila. It does not report errors; Sentry does. The web app sends events only once its key is set in the deployment; mobile builds made from `main` already send usage events. Firebase is planned and has no code yet. Nothing in the admin app reports to either.

| | PostHog in the member apps |
|---|---|
| Live today | PostHog was added on `main` on 2026-10-07, without the address cleaning described below. The owner action is in [Known issues and owner actions](/faqs/known-issues-and-owner-actions) |
| On nicoleDev, not yet live | Page and screen addresses are cleaned before anything is sent: only a short list of known-safe parts is kept and everything else is dropped. PostHog session replay and heatmaps are off, and Mila uses no PostHog feature flags |

If a member asks what Mila records about her use of the app, tell the owner.

### Email (Resend)

Resend is the service Mila would use to send email from its own address. It is not set up, because no domain has been bought for Mila yet. What that means today:

- **Announcements** does a dry run and delivers nothing. See [Announcements](/faqs/announcements).
- The member app skips its own emails (password changed, account deleted, payment receipts) and carries on without error.
- Password reset and email-change messages use a different, built-in sender that has its own limits, so reset mail can be slow or limited. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

## Common questions

**The Revenue panel says Paddle is not set. Is something broken?** No. Paddle payments are not live yet.

**Can I see errors members hit?** Not in the admin app. Error reports go to Sentry, which staff cannot open from the admin app. Ask the owner.

**Does Sentry see what I search for?** After the nicoleDev release it removes search text from addresses and from the keys it records. On the live admin app today it does not, so avoid searching by a member's email or name unless you need to.

**Which numbers can I use in a meeting today?** Counts like members, looks, posts and products are safe. Treat MRR as wrong until the release, and revenue as unavailable until Paddle is live.
