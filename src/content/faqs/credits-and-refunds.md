---
title: Credits and refunds
category: Credits & billing
summary: Daily and purchased credits, the spend order, when a credit comes back, the midnight rule, and what changes with the nicoleDev release.
tags: [credits, refunds, daily, purchased, owed, midnight, allowance, dupe, generation]
order: 10
updated: 2026-10-07
status: partly-live
---

Most AI styling actions in Mila cost one credit. This article explains where credits come from, the order they are spent in, and exactly when a credit comes back.

Some rules are different on the live site and in the next release. Each one is marked **Live today** or **After the nicoleDev release**.

> **Important:** "After the nicoleDev release" means all three of these have happened:
> 1. the owner has merged `nicoleDev` into `main` for the member web app (the admin app's merge changes only how admin shows balances, see [How to check in admin](#how-to-check-in-admin));
> 2. the migration `20261007143000_generation_jobs.sql` has been applied to production;
> 3. the migration `20261007170000_tracked_ai_credit_refunds.sql` has been applied to production.
>
> As of 2026-10-07 none of the three has happened, so the **Live today** rules are the ones members get. See [Environments and releases](/faqs/environments-and-releases).

## The short version

| Question | Live today | After the nicoleDev release |
|---|---|---|
| Kinds of credit | Daily and purchased | Same |
| Spend order | Daily first, then purchased | Same |
| Failed action paid with a purchased credit | Comes back as a purchased credit | Same |
| Failed action paid with a daily credit, same credit day | Comes back | Goes back into today's daily credits |
| Failed action paid with a daily credit, refunded after the credit day rolled over | Comes back | Added to today's daily credits, **never above the day's allowance** |
| Request the server cut off at its time limit | Not refunded | Refunded, for looks, style sheets and portraits. A daily credit cleaned up after the 8:00 am reset follows the midnight rule |
| Dupe hunt that finds nothing | Charged | Refunded only if our catalogue has nothing close, at most 3 in 24 hours |
| Can one failure be refunded twice? | No | No, and the database itself refuses a second refund |

## The two kinds of credit

### Daily credits

- They come with a plan, either a paid plan or one a Steward granted. Each plan has a daily allowance. See [Subscriptions and plans](/faqs/subscriptions-and-plans).
- Every credit day starts with the full allowance. Unused daily credits do not carry over to the next day.
- A member with no plan has no daily credits. A new free account starts with 0 credits.

### Purchased credits

- They never reset and never expire.
- Credits a Steward adds with **Add styling credits** are purchased credits. See [Adding styling credits](/faqs/adding-credits).
- Nothing in the member app sells single credits today. Purchased credits come from staff. Live today some members also hold purchased credits no staff grant explains (see below).
- The landing page mentions credit packs, but none are on sale. If a member asks, tell her packs are not available yet and that staff can add credits.
- Holding any purchased credits counts her as a paying member. Free accounts share a daily limit on style sheet and portrait renders; a paying member is limited only by her own credits.

### Spend order

Daily credits are always spent first. Purchased credits are used only when today's daily credits are gone.

### The credit day

- Credit days follow UTC. A new credit day starts at **00:00 UTC, which is 8:00 am Philippine time**.
- In this article, "midnight" means the start of a new credit day, so 8:00 am Philippine time.
- Her daily credits refill at her first charged action of the new day, or at the daily cleanup at 00:05 UTC (8:05 am Philippine time), whichever comes first. The member app already shows the full allowance from 8:00 am.

### What she sees

The member app shows **one number**: daily plus purchased. She cannot see the split. In the phone app it reads "N of 3 left today" for a plan with 3 a day, and N includes her purchased credits, so it can be higher than the plan number. Staff can see the split: see [How to check in admin](#how-to-check-in-admin).

## Which actions cost a credit

The cost and the basic refund triggers are the same live today and after the release, except where marked. A request the server cuts off follows the rules under [Looks, style sheets and portraits](#looks-style-sheets-and-portraits).

| Action | Cost | The credit comes back when |
|---|---|---|
| Create my look | 1 credit | The look fails |
| Style sheet or portrait preview | The first one after each new look is free, then 1 credit | It fails or no image comes back. If it was the free one, the free one comes back instead, unless the request was cut off by the server |
| Dupe Hunter | 1 credit | The hunt fails with an error. After the release, also when our catalogue has nothing close (see below) |
| Colour read | Her first one ever is free, then 1 credit | The read does not succeed |
| Lens style analysis | 1 credit | It fails |
| Concierge chat | 1 credit per reply | It fails |
| Finding the garments in an outfit photo (for example when she posts an outfit) | 1 credit | It fails, or no garments are found |

## Live today: purchased credits nobody added

Some members hold purchased credits that neither they nor staff added. This is a known issue on the live site, and the nicoleDev release fixes it.

What this means for staff:

- **It is not the member's fault**, and nothing is wrong with her account.
- In admin her purchased credits can be higher than any staff grant explains, and her total can be higher than her plan's daily number. To check, look for `member.credits_granted` rows in the staff audit log (see [How to check in admin](#how-to-check-in-admin)). Purchased credits that no grant explains came from this issue.
- **Do not remove these credits**, and do not promise she can keep them. There is no admin tool to take credits away, and what happens to these balances is the owner's decision.
- **Tell the owner** which member it is and the numbers you saw.
- **Do not explain the cause to the member.** Use the script under [What to tell the member](#what-to-tell-the-member) below.

## After the nicoleDev release: a refund goes back where it came from

These are the rules once the release is complete.

1. **Purchased goes back to purchased**, straight away, at any time of day.
2. **Daily, refunded on the same credit day**, goes straight back into today's daily credits, in full.
3. **Daily, refunded after the credit day rolled over**, is **owed**. It is added to today's daily credits at her next charged action, but **only up to the day's normal allowance, never above it**. If today's daily credits are already full, nothing extra is added. **If her plan has ended by then, her allowance is 0, so nothing is added at all.**
4. A daily refund **never** changes her purchased credits.
5. **Each refund happens exactly once.**

### The midnight rule

This is the one rule that surprises people, so here it is in one line:

> **Today's daily credits after the refund = the smaller of (what she has left today + the refunds owed) and (her plan's daily allowance).**

With no live plan the allowance is 0, so an owed refund adds nothing.

Why it works this way:

- **She loses nothing.** The refunded credit belonged to yesterday, and yesterday's daily credits expired at 8:00 am anyway. Today she already started with her full allowance, so she still has her full day.
- **Refunds don't pile up.** A daily credit refunded after the reset can only top today's daily credits back up to the allowance, so refunds never carry extra daily credits from one day into the next.
- **Same-day failures are not touched.** A failure on the same credit day always gives the credit back in full. The cap only applies to a refund that crosses into a new credit day.
- **Above the allowance for a while is normal.** A same-day refund always comes back in full. If she had requests running when an owed refund topped her up, and those requests then fail the same day, her daily credits can sit above her plan's number for the rest of the day, for example 5 on a plan of 3. That is expected. It is not the live purchased-credits issue: her purchased credits do not change, and the extra daily credits are gone at the next 8:00 am reset. In admin, the "X plan" part of the split can show more than the plan gives.

A refund "crosses midnight" when the credit was charged on one credit day and the refund is recorded on a later one. Usually that is a request charged just before 8:00 am Philippine time that failed just after it. It also happens when a request the server was stopped on is only cleaned up after the next 8:00 am reset.

### Worked examples (allowance 3)

| # | Situation | Daily credits before the refund | What the refund adds | Daily credits after the refund |
|---|---|---|---|---|
| 1 | **Same day.** A look charged at 10:00 am fails at 10:03 am. | 2 | +1, at once | **3** |
| 2 | **Crossed midnight, room left.** Last night's look failed after 8:00 am. She has spent 2 today. | 1 | +1 | **2** |
| 3 | **Crossed midnight, already full.** Same failed look, but she has spent nothing today. | 3 | **+0** (capped) | **3** |
| 4 | **Two crossed midnight, room for one.** Two of last night's jobs failed. She has spent 1 today. | 2 | +1, the other is absorbed | **3** |
| 5 | **Purchased.** A free account with 5 purchased credits runs a Dupe hunt. It is charged (4 left) and the hunt stops with an error. | 4 purchased | +1 purchased, at once | **5 purchased** |
| 6 | **Out of credits, refund owed.** She has used all 3 today and has no purchased credits. One refund is owed from last night. Her plan is still live. | 0 | +1, just before her next action is charged | Her next action is paid by it. She does **not** see the out-of-credits screen for that action. If her plan has ended, nothing is added and she does see it. |

A seventh case, to show purchased credits stay safe: she has 0 daily credits left and 2 purchased, and one daily refund is owed. Her next action is paid by the returned daily credit. Her 2 purchased credits are untouched.

### When she sees an owed refund

An owed refund is settled at her **next charged action**. That is when the system knows her plan's daily allowance, which the cap needs. The refund is counted first, then the action is charged.

So on her screen it does not appear as "+1". It appears as **her next action costing nothing**:

- In example 2 she sees 1 credit, does one action, and still sees 1.
- In example 3 she sees 3, does one action, and sees 2, exactly like any normal day.

Most often, a request that crossed midnight fails before she has done anything else that day. Her first charged action then finds her daily credits still full, so the refund adds nothing (example 3). Example 2 happens when the failure is recorded after she has already used some of today's credits, for example when she ran two Dupe hunts while a look started before 8:00 am was still working.

A free action (her free style sheet after a look, or her first colour read) is not a charged action, so it does not settle an owed refund.

Staff cannot see owed refunds in admin. Her balance in admin changes only when the refund is settled.

### Each refund happens exactly once

Every charge has one record in the database: a receipt for most features, and the job itself for looks, style sheets and portraits. A refund marks that record. The database refuses to refund the same record twice, even if two refunds race each other. It also never refunds something that was not charged.

### Looks, style sheets and portraits

After the release these run as **generation jobs**. The credit rules for them:

- **One charge per request.** If she presses again with the same choices while it is running (from a second tab, or after leaving and coming back, since the button is greyed out on the page that started it), she joins the same request. No second charge, and she gets the same result. "Same choices" includes the vibe, the optional fields and the weather reading.
- **A different request of the same kind while one is running** gets "Mila is still finishing your last request. Try again in a moment." on the web, or "Mila needs a moment. Try again in ..." with a countdown in the phone app. **No charge.**
- **A failure is refunded once**, following the rules above.
- **Cut off by the server.** If the server runs out of time it stops the request itself and refunds it at once. If the server was stopped before it could do that, the job is treated as failed 5 minutes 30 seconds after it started and refunded later: when she next starts a look, style sheet or portrait, or at the daily cleanup at 00:05 UTC (8:05 am Philippine time). A purchased credit always comes back. A daily credit comes back in full only if that happens on the same credit day. If it is only cleaned up after the 8:00 am reset, the midnight rule applies, and because the cleanup has just refilled her daily credits it usually adds nothing.
- **Finished but not saved.** If the server finished but could not save its copy, it still sends the result to her screen and keeps the charge, because she received what she paid for. If she had already left the page, that result is lost; ask the owner.
- **Free visual.** If the request used her free style sheet or portrait and the server reports the failure, the free one comes back instead of a credit. If the server was stopped and the job is only cleaned up later, the free one does **not** come back (see [Known issues and owner actions](/faqs/known-issues-and-owner-actions)).

Details: [Generations and tab switching](/faqs/generations-and-tab-switching).

### Dupe Hunter

- The credit is refunded when the hunt stops with an error, or when **our catalogue has nothing close at all**, judged **before** her own budget and region filters.
- **At most 3 "nothing close" refunds per member in 24 hours**, counted from the first one. After that, an empty hunt is charged like any other, with no error.
- If close matches exist but her budget or region hid them, **she is charged**. The server's reply says why ("Close matches exist above your budget."), but the web and mobile screens do not show that line yet. They show the general "no matches" note.
- If the hunt stops with an error, the credit is refunded as before, and that does not count toward the 3.

Details: [Dupe Hunter](/faqs/dupe-hunter).

### If only part of the release is in place

The code checks whether each migration exists and falls back safely when it does not. That means the order matters for what members get.

| What is in place | What happens to refunds |
|---|---|
| Migrations applied, code not merged | Nothing changes for members. The live code does not use them. |
| Code merged, neither migration applied | Exactly as **Live today**, including the purchased-credits issue above. |
| Code merged, only the generation jobs migration | Looks, style sheets and portraits follow the new rules. Every other feature still refunds as live today. |
| Code merged, only the tracked refunds migration | Every feature follows the new refund rules. Looks, style sheets and portraits do not get the job features (joining a running request, refunds for cut-off requests). |
| Code merged and both migrations applied | Everything in this article. |

## What to tell the member

Short scripts. Use the one that matches the version she is on. Never promise a refund or a time; staff cannot see refund records.

**"Something failed. Did I lose my credit?"**

First ask what happened: did she see an error message, or did the result just never appear (she left the page, reloaded, or it timed out)?

- **She saw an error, live today:** "When a request stops with an error, Mila normally returns the credit. If your balance still looks wrong, tell me and I'll ask the team to check."
- **She saw an error, after the release:** "When a request stops with an error, Mila normally returns the credit to the same kind of credit you paid with. If your balance still looks wrong, tell me and I'll ask the team to check." If it started before the 8:00 am reset and failed after it, use "My credit didn't come back after the daily reset" below instead.
- **The result never appeared, live today:** do not tell her she lost nothing. Say: "If you only moved to another page in Mila while a look was being made, go back to the dashboard and give it a few minutes; it may still appear there. If you left the page, reloaded or it timed out, Mila may have finished the request and used the credit without being able to show it to you. I'm passing this to the team." Tell the owner the time it happened.
- **The result never appeared, after the release:** "If you only moved to another page in Mila while a look was being made, go back to the dashboard and give it a few minutes; it may still appear there. If the page reloaded or was closed, your request most likely kept going and was charged once, and the screen can't show it yet. I'm passing this to the team." See [Generations and tab switching](/faqs/generations-and-tab-switching).

**"I have more credits than my plan gives me."**
- Live today: "Your balance includes some extra credits. Nothing is wrong with your account, and you haven't done anything wrong. I've passed it to the team to check." Then tell the owner (see [Live today: purchased credits nobody added](#live-today-purchased-credits-nobody-added) above).
- After the release: first check the split in **Add styling credits** (see [How to check in admin](#how-to-check-in-admin)). If the daily part is above her plan's number, say: "Some credits that were refunded today went back into today's credits, so for now you have a few more than your plan's daily number. They reset with the rest at 8:00 am Philippine time." If the purchased part explains it, say: "Your balance includes extra credits that don't reset. Nothing is wrong with your account." If purchased credits are there that no staff grant explains, follow the live-today steps above.

**"My credit didn't come back after the daily reset."** (after the release)
"Your request started before the daily reset at 8:00 am and finished after it. A credit like that is added back to today's credits the next time you use a credit, up to your plan's daily amount. If you hadn't used any credits yet today, your daily credits were already full, so there was no room to add it. If you had already used some, it is added at your next action, so that action costs nothing. Yesterday's credits reset at 8:00 am anyway, so you haven't lost anything from today."

If her plan has ended, nothing is added. Staff cannot see owed refunds; if she is sure something is wrong, ask the owner.

**"I was charged for a Dupe hunt that found nothing."**
- Live today: "Dupe Hunter charges for the scan itself, even when it finds no matches."
- After the release: "We refund a hunt when our catalogue has nothing close to your piece, up to 3 times in 24 hours. If similar pieces exist but cost more than the budget you typed, or don't ship to your delivery country, the scan is charged. A new scan without a budget may show the ones above your budget, but it uses another credit."

**"It says Mila is still finishing my last request."** (web), or after the release **"It says Mila needs a moment."** (phone app)
"Your last request is still running, and you haven't been charged for this one. Please wait a few minutes, then try again."

**"Why is my balance lower than I expected this morning?"**
"Daily credits reset at 8:00 am Philippine time, and unused ones don't carry over. Credits added by our team never reset."

## How to check in admin

1. **Members** (Stewards only). The **Credits** column shows her credit number: daily plus purchased.
   - Live today: it adds her stored numbers. Early on a new credit day, before her first action or the 8:05 am cleanup, it can still include yesterday's unused daily credits, and it keeps showing them after her plan has ended until her next action.
   - After the release: it matches the number the member app shows, except for a member whose plan has been hidden or archived (see [Subscriptions and plans](/faqs/subscriptions-and-plans)).
2. **Her daily and purchased split.** Open her row's actions menu (**Open actions**), then **Add styling credits**. The dialog shows "Current balance: N credits (X plan + Y purchased)". X is her daily credits and Y is her purchased credits. Press **Cancel** to close without adding anything. The same live-today caveat applies to X.
3. **Database** (Stewards only), table `user_entitlements`:
   - `ai_credits`: her daily credits for the credit day in `credits_reset_at`;
   - `purchased_credits`: her purchased credits;
   - `credits_reset_at`: the credit day (a UTC date) her daily credits belong to. If it is not today's UTC date, her daily credits will refill to the allowance at her next action.
4. **Database**, table `staff_audit_log`. Rows with the action `member.credits_granted` show every staff grant, with the amount and the note. Purchased credits that no grant explains come from the known issue (see above).
5. **Database**, table `ai_spend_log`. It lists the AI calls made for her and what they cost Mila. A row there shows the AI was called. It says nothing about credits.

**What admin cannot show you:** refund records (receipts and generation jobs), owed refunds, or whether one particular action was refunded. Those live in tables staff cannot browse. If a case needs that check, ask the owner.

See also [Database browser](/faqs/database-browser).

## Related articles

- [Adding styling credits](/faqs/adding-credits)
- [Generations and tab switching](/faqs/generations-and-tab-switching)
- [Dupe Hunter](/faqs/dupe-hunter)
- [Subscriptions and plans](/faqs/subscriptions-and-plans)
- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
- [Glossary](/faqs/glossary)
