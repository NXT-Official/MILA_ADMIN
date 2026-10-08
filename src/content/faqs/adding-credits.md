---
title: Adding styling credits
category: Credits & billing
summary: How a Steward adds styling credits to a member, what kind of credit they are, how to check her balance, and what to tell her.
tags: [credits, add-credits, purchased, balance, members, steward, grant]
order: 20
updated: 2026-10-07
status: live
---

Stewards can add styling credits to any member from the Members page. This works the same on the live admin app today and after the nicoleDev release, apart from the error handling and the balance shown in the dialog, both noted below.

## Who can do this

Only **Stewards** (the admin role). Moderators do not see the Members page. See [Members and roles](/faqs/members-and-roles).

## What kind of credit they are

Credits you add are **purchased credits**:

- they **never reset and never expire**;
- they are spent **after** her plan's daily credits, so they last;
- they count her as a paying member, which lifts the shared daily render limit for free accounts.

They go through the same database function the member app uses, so the app treats them exactly like any other purchased credit. For the full rules, see [Credits and refunds](/faqs/credits-and-refunds).

## When to add credits, and when to grant a plan instead

| You want to | Use |
|---|---|
| Give a fixed number of credits that never expire (a goodwill gesture, a demo account, a new free account that starts at 0) | **Add styling credits** (this article) |
| Give a daily allowance that refills every day | **Plan & billing**, then **Grant plan**. See [Subscriptions and plans](/faqs/subscriptions-and-plans) |

A new free account starts with **0 credits**, so every charged AI action is refused with an out-of-credits message until she has credits or a plan. Her first colour read is free.

## Steps

1. Open **Members** in the sidebar.
2. Find the member. The search box matches name, username or email.
3. Open her row's actions menu (**Open actions**) and choose **Add styling credits**.
4. Read the **Current balance** line first: "Current balance: N credits (X plan + Y purchased)". X is her daily credits, Y is her purchased credits. Note the total in case you need to check later.
5. In **Credits to add**, type a whole number from 1 to 100,000. It starts at 10.
6. In **Note (staff audit log)**, write why, for example "Demo account" or "Goodwill after a failed look". Up to 200 characters. Keep it factual and leave out personal details.
7. Press **Add credits**.
8. A message confirms how many credits were added and her new balance. The Members list refreshes.

## What happens when you press Add credits

- The credits land in her **purchased** credits straight away.
- If her credit day had not started yet (no action today and before the daily cleanup), adding credits also starts it: her daily credits are set to her plan's allowance for today. She loses nothing. It is the same refill her first action of the day would do. (Live today, if the plan lookup fails silently, her daily credits for that day can be set to 0 instead; after the release the grant stops with "Couldn't read this member's plan.")
- The grant is recorded in the staff audit log with the action `member.credits_granted`, the amount, your note and her new total.

## If something goes wrong

**After the nicoleDev release:**

| What the message says | What it means | What to do |
|---|---|---|
| Couldn't confirm the credits were added. Check the member's balance before trying again. | The connection dropped. The credits **may** have been added. | Reopen the dialog and compare the balance with the total you noted in step 4. Only try again if it has not gone up. |
| Couldn't read this member's plan. Nothing was changed, please try again. | Nothing was written. | Safe to try again. |
| This member has no credit record yet. | Her account setup never finished. | Do not retry. Tell the owner. |
| This member's plan has an invalid daily allowance. Check it on the Plans screen. | Nothing was written. | Check the plan's Credits Included on Plans, then try again. |
| Enter a whole number of credits from 1 to 100,000. | Nothing was written. | Fix the number and try again. |
| Success, with a note that the staff activity log entry couldn't be saved | The credits **were** added. Only the log entry is missing. | Do **not** add again. |

**Live today:** errors show the database's own wording. If the audit log entry fails, you see an error ("The action succeeded, but its audit record could not be saved.") even though **the credits were added**, and the dialog stays open.

> **Important:** On any error, live or after the release, close the dialog, reopen it and check the balance **before** trying again. A second press can add the credits twice.

## How to check her balance

- **Members list**, **Credits** column: daily plus purchased.
  - Live today it adds the stored numbers. Early on a new credit day, before her first action or the 8:05 am cleanup, it can still include yesterday's unused daily credits, and it keeps showing them after her plan has ended until her next action.
  - After the release it matches the number the member app shows, except for a member whose plan has been hidden or archived (see [Subscriptions and plans](/faqs/subscriptions-and-plans)).
- **Add styling credits** dialog: the split, "X plan + Y purchased". Live today it shows her stored numbers; after the release it shows what she can spend today. Press **Cancel** to close without adding.
- **Database**, table `user_entitlements`: `ai_credits` (daily), `purchased_credits`, and `credits_reset_at` (the UTC credit day her daily credits belong to). See [Database browser](/faqs/database-browser).
- **Database**, table `staff_audit_log`: every grant, with who made it and the note.

> **Note:** A member can hold purchased credits that no staff grant explains. This is a known issue the nicoleDev release fixes. If no `member.credits_granted` row explains her purchased credits, don't remove them; tell the owner. See [Credits and refunds](/faqs/credits-and-refunds).

## What to tell the member

**After adding credits:**
"I've added N styling credits to your account. They don't expire, and Mila uses your plan's daily credits first, so these last. You'll see them in your credit count now. If you don't, reload the page or reopen the app."

**If she has no plan:**
"I've added N styling credits so you can try Mila's styling. They don't expire. A new look or a Dupe hunt uses one credit each."

**If she asks why the number is one total:**
"The app shows your daily credits and your extra credits together as one number. Daily credits are used first and reset every day at 8:00 am Philippine time. Extra credits never reset."

## Related articles

- [Credits and refunds](/faqs/credits-and-refunds)
- [Subscriptions and plans](/faqs/subscriptions-and-plans)
- [Members and roles](/faqs/members-and-roles)
- [Database browser](/faqs/database-browser)
