---
title: Database browser
category: Platform & releases
summary: How to look at live Mila data safely, why the Database page is read-only, and the privacy rules that apply to every row you see.
tags: [database, tables, search, export, privacy, readonly, csv, audit]
order: 40
updated: 2026-10-07
status: live
---

The Database page lets a Steward look at the real tables behind Mila: members, looks, posts, messages, plans, payments and more. It is a window, not a control panel. You can read and export rows, but you cannot change them from here.

> **Important:** Everything on this page is real, live member data, and it is shared. The live site, the test copy of the app (the `nicoleDev` preview) and the mobile app all use the same database. There is no practice copy. Never screenshot it, copy it into a chat, email it, or share an export outside the team.

## Who can use it

Stewards only. Moderators do not see the Database page. The same table browser also sits at the bottom of the Analytics page, with the same rules.

## Read or edit?

**Read only.** The page has no way to add, change or delete a row. The only things it can do are show rows, search, page through, refresh and download a file. The page itself says "Read-only view of the live database."

Other pages change data on purpose, for example Members, Plans and Moderation. Each of those writes to the audit log. Some ask for confirmation first, but not all: on Plans, the Active and Featured switches and Archive take effect the moment you click. The Database page does neither, because it changes nothing.

> **Note:** Looking at the Database page is not recorded in the staff audit log. Nothing will show that you opened a table or what you looked at. That makes your own care the only protection.

## What the page shows

1. A **Browse Table** list with 19 tables, ordered with the business tables first. A one-line description of the table is under the list.
2. A search box, **Refresh** and **Export CSV**.
3. The rows, newest first, 50 to a page. Long values are cut short in the grid and show in full when you hover over them. Nested values appear as raw JSON text.
4. A footer such as "120 total, page 1 of 3" (shown with a dot instead of the comma), with **Previous** and **Next**.

The tables, grouped by what they hold:

| Group | Tables |
|---|---|
| Money and plans | `subscriptions`, `purchases`, `subscription_plans` |
| Catalogue | `products`, `brands` |
| Looks and community | `outfits`, `post_items`, `posts`, `saved_palettes` |
| Concierge chat | `concierge_conversations`, `concierge_messages` |
| People and access | `profiles`, `user_roles`, `user_entitlements` |
| Support and staff | `support_messages`, `staff_audit_log` |
| Usage and cost | `ai_spend_log`, `analytics_events`, `rate_limit_buckets` |

The page address remembers the table, for example `/database?table=subscriptions`. Cards on the Analytics page link straight to the table behind their number.

## Search

1. Type in the search box. It waits a third of a second after you stop typing.
2. It matches any part of certain text columns, ignoring capital letters. Which columns depends on the table: for example title and description for plans, name and username for profiles, message text for support messages, action and target for the audit log.
3. The footer then says "N matching".

Some tables cannot be searched, because they hold no text columns. The box says "No text columns to search". These are `user_roles` and `user_entitlements`.

Commas, round brackets, double quotes, backslashes and stars are treated as spaces. If nothing matches, you see "No rows in (table) match" followed by your search in quotes.

## Export CSV

**Export CSV** downloads the rows on the current page only, with the table name in the file name. It does not export the whole table.

The file lands on your computer with real member data in it. Open it, use it for the job at hand, then delete it. Do not upload it anywhere or forward it. Cells that start with a character spreadsheets treat as a formula are made safe, so opening it will not run anything.

## The privacy duty

These rules apply to everyone who can open this page.

1. **Look only at what the job needs.** Do not browse people out of curiosity.
2. **Never screenshot or photograph the screen** while member data is showing.
3. **Never paste rows into chat, email, documents or tickets.** If you must tell the owner about a row, send the table name and the row's id, not the content.
4. **Delete exports** as soon as you are done.
5. **Do not name or identify members** in anything you write about a problem.
6. **If you see something you should not, tell the owner.** This includes a stranger's private messages and photos.

Some tables are especially private.

| Table | Why |
|---|---|
| `concierge_messages`, `concierge_conversations` | Members' private chats with the AI stylist |
| `support_messages` | Help requests, which can contain personal details |
| `profiles` | Names, handles, body measurements, location, style details and photo references |
| `outfits`, `posts`, `post_items` | Links to members' own photos and captions |
| `subscriptions`, `purchases` | Payment provider references |
| `staff_audit_log` | Staff actions, which for some actions include a member's email and name |
| `ai_spend_log`, `analytics_events` | Per-member usage records |

> **Important:** The page reads with full database access, so it ignores the privacy rules that stop members seeing each other's data. You will see rows that no member would ever see.

## The audit log

`staff_audit_log` is where you can check who changed a role, suspended a member, hid a post, granted credits or plans, resolved a message, sent an announcement or changed an AI setting. Search it by action word, such as `role`, `post` or `plan`, or by the type of thing changed. Reading it is allowed. See [Members and roles](/faqs/members-and-roles) and [Moderation](/faqs/moderation) for the actions that write to it.

## Common questions

**Can I fix a wrong row here?** No. Tell the owner the table and the row's id. Fixes to data are made by the owner, and for some things a page elsewhere in the admin app does the change safely, such as Plans or Members.

**Why can I not see email addresses?** Member emails are kept in the sign-in system, not in these tables. The one exception is the audit log: adding or deleting a member records that member's email there. The Members and Subscriptions pages show emails where needed.

**Can I look at the data on the test copy without touching live data?** No. Both read the same database. See [Environments and releases](/faqs/environments-and-releases).

**I opened the wrong table by mistake and saw private messages.** Close the tab, do not copy anything, and tell the owner. Reporting it straight away is the right thing to do.

**The page says "Couldn't load".** Press **Retry**. If it keeps failing, tell the owner.
