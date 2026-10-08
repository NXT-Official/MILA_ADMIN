---
title: Start here
category: Start here
summary: What the Mila admin app is, who can use each page, how this guide and its search work, and a map of every section.
tags: [start, overview, roles, steward, moderator, search, sidebar, help]
order: 10
updated: 2026-10-07
status: live
---

This guide is for Mila staff. Every step in it was checked against the admin app's code. When the live site behaves differently from the next release (the `nicoleDev` branch), the article shows a "Live today" and an "After the nicoleDev release" pair so you always know which one you are looking at.

## What the admin app is

The admin app is a separate website for staff. It has its own address and its own sign-in, and nothing in the member app links to it.

| | Address |
|---|---|
| Live admin app | https://mila-admin-tau.vercel.app |
| Live member web app | https://mila-umber.vercel.app |

The admin app and the member web app use the same Supabase project, and the mobile app talks to the same web backend. That means the same accounts and the same data. A change you make in the admin app reaches members straight away. There is no separate test copy of the data.

> **Important:** The test copy of the admin app (the `nicoleDev` preview) also reads and writes the live data. Treat every page, on every address, as live. See [Environments and releases](/faqs/environments-and-releases).

### Signing in

1. Open the admin address and enter your normal Mila email and password.
2. Solve the hCaptcha box. The **Enter Mila Studio** button stays off until you do.
3. You land on your home page: Dashboard for a Steward, Moderation for a Moderator.

If the account has no staff role, the app signs it out at once and shows "This sign-in is for Mila staff only." This is deliberate, so a member cannot use the staff form. For password and session problems see [Sign-in and sessions](/faqs/sign-in-and-sessions).

## The two roles

The app has two roles. The permission map lives in `src/lib/authorization.ts`.

| Role you see | Name in the code | What the sidebar shows | Where you land |
|---|---|---|---|
| Steward | `admin` | Every section | Dashboard |
| Moderator | `moderator` | Moderation, Support, Settings, FAQs (Training) | Moderation |

- A Steward can do everything a Moderator can do, and more.
- A Moderator cannot see Members, so cannot see member emails. Moderators also see no author email on the Moderation page.
- If a Moderator types the address of a Steward page, the app sends them back to a page they can open. Even if that check were skipped, every action is checked again on the server and refused with "You do not have permission to do that."
- Roles are given and taken away on the Members page. See [Members and roles](/faqs/members-and-roles).
- Mila must always keep at least one active Steward. The app refuses any change that would remove the last one.

## Map of every section

| Section | Steward | Moderator | What it is for | Read this |
|---|---|---|---|---|
| Dashboard | Yes | No | Headline numbers and the newest members and posts | Below |
| Analytics | Yes | No | Revenue, usage numbers, and a table browser | [Analytics and error reporting](/faqs/analytics-and-error-reporting) |
| Database | Yes | No | Read-only view of the live tables | [Database browser](/faqs/database-browser) |
| Shop | Yes | No | The product catalogue and its links | [Shop catalogue](/faqs/shop-catalogue) |
| Members | Yes | No | Roles, suspend, edit, credits, plan and billing | [Members and roles](/faqs/members-and-roles) |
| Subscriptions | Yes | No | Who paid what, with invoices and receipts | [Subscriptions and plans](/faqs/subscriptions-and-plans) |
| Plans | Yes | No | The membership plan catalogue | [Subscriptions and plans](/faqs/subscriptions-and-plans) |
| Announcements | Yes | No | Email every member about an update | [Announcements](/faqs/announcements) |
| AI Settings | Yes | No | The AI models behind styling, the revenue tax, cost per call | [AI settings](/faqs/ai-settings) |
| Moderation | Yes | Yes | Hide, restore or delete feed posts | [Moderation](/faqs/moderation) |
| Support | Yes | Yes | Help desk and feedback messages | [Support inbox](/faqs/support-inbox) |
| Settings | Yes | Yes | Change your own password | Below |
| FAQs (Training) | Yes | Yes | This guide | This article |

Other articles worth knowing: [Credits and refunds](/faqs/credits-and-refunds), [Adding credits](/faqs/adding-credits), [Known issues and owner actions](/faqs/known-issues-and-owner-actions) and the [Glossary](/faqs/glossary).

## The two pages with no article of their own

### Dashboard

Steward only. It opens with cards that are also links: click one to open the page that manages that number.

| Card | What it counts | Opens |
|---|---|---|
| Total Members | All member profiles | Members |
| Stewards | Accounts holding the Steward role | Members |
| AI Credits Available | The credit columns added up across every member, as stored | Members |
| Feed Posts | All posts, hidden ones included | Moderation |
| Hidden Posts | Posts staff have hidden | Moderation |
| Open Support Messages | Messages not yet marked resolved | Support |
| Shop Items | Products in the catalogue | Shop |

Below the cards, Recent Members lists the five newest sign-ups (name, handle, date) and Recent Activity lists the five newest posts, with a Hidden tag where it applies.

> **Note:** The AI Credits Available card adds up the stored credit numbers for every member, so it is a rough total, not what members can spend. For one member, use the Credits column on the Members page, and check which version you are on.

| | Credits column on the Members page |
|---|---|
| Live today | The stored numbers added up, the same way as the card. Early on a new credit day it can still hold yesterday's unused daily credits, and it keeps showing daily credits after her plan has ended until her next action, so it can be higher or lower than what she can spend. Check the split in **Add styling credits** and her plan before quoting a number. |
| After the nicoleDev release | What she can spend today: today's daily credits from her live plan (none without a live plan) plus her purchased credits. It can differ from the card, which still adds the stored numbers. |

### Settings

Both roles. It has one form, Change Password, for your own account.

1. Open Settings at the bottom of the sidebar.
2. Enter your current password. The app signs you in again with it first, so a session left open on a shared computer cannot change the password alone.
3. Enter the new password twice. It needs at least 12 characters, one lowercase letter, one uppercase letter, one digit and one symbol. A strength bar and checklist update as you type.
4. Solve the hCaptcha box and press the button. You see "Password updated."

## How to use this guide

1. Open **FAQs (Training)** in the sidebar. Both roles can open it.
2. Type in the search box. Every word you type must be found in the article, in its title, tags, headings, summary or body. A word matches the start of a word, so "refund" finds "refunds" but "fund" does not. Only the first 200 characters you type are searched. Title matches rank highest, then tags, headings, summary and body. Capital letters and accents do not matter.
3. Each result shows a short snippet with your words highlighted. Clicking a result opens the article at the heading that matched best.
4. Without searching, browse by category: Start here, Credits & billing, Members & accounts, Sign-in & sessions, AI features, Shop & catalogue, Community & moderation, Support, Platform & releases, Reference.
5. The search words stay in the page address, so you can send a colleague a link to the same search.

Each article has a status. **Live** means everything in it works today. **Partly live** means some of it works and the article says which part. **Coming** means it is planned.

The articles are Markdown files kept in the admin app's code, so every change is reviewed and can be undone. If something here is wrong, tell the owner so it can be fixed. Do not work around it.

## Before you change anything

1. **Check which address you are on.** Live and preview share the same data, so a mistake on either one is a real mistake.
2. **Treat member data as private.** Names, emails, photos, chat messages and support messages are not for screenshots, chat apps or personal notes. See [Database browser](/faqs/database-browser).
3. **Prefer the gentle action.** Suspend before delete. Hide before delete. Archive a plan before deleting it.
4. **Know what is recorded.** These actions write a line to the staff audit log: creating, editing, suspending and deleting members, role changes, credit grants, plan grants and billing changes, plan edits, hiding, restoring and deleting posts, resolving support messages, announcements and AI setting changes. Browsing the Database page is not recorded.

## Where to ask for help

1. Search this guide first.
2. Read [Known issues and owner actions](/faqs/known-issues-and-owner-actions). Some things are known gaps that only the owner can close.
3. Moderators: ask a Steward. Stewards: ask the owner.
4. When you report a problem, send the time, the page, what you clicked and the message on screen. Do not include member names, emails or photos.

> **Note:** The admin app has no built-in staff help desk. The Support page is for member messages, not for staff questions.
