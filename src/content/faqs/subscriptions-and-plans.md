---
title: Subscriptions and plans
category: Credits & billing
summary: The Subscriptions and Plans pages, how to grant a plan by hand, and a plain statement that Paddle payments are not live yet.
tags: [subscriptions, plans, paddle, billing, grant, archive, invoice, receipt, featured]
order: 30
updated: 2026-10-07
status: partly-live
---

This article covers two pages: **Subscriptions**, which lists memberships, and **Plans**, which is the catalogue of plans a member can have. It also covers the **Plan & billing** window on the Members page.

> **Important:** Paddle payments are NOT live yet. Members cannot buy a plan or a credit pack today. On the member site the Choose Plan button reads "Checkout is unavailable right now". Anything below that talks to Paddle (invoices, revenue, refunds, plan switches) only works once the owner has set up Paddle on the admin app. Until then, the only way a member gets a plan is for a Steward to grant one by hand.

## Who can use it

Stewards only. Moderators see neither page.

## What Paddle not being live means for you

| You see | What it means |
|---|---|
| A banner on Subscriptions: "Paddle isn't configured on this deployment, so live amounts and invoice numbers are unavailable." | Normal for now. The rows still show, from what Mila recorded |
| A note on Analytics that revenue cannot be read | Normal for now. See [Analytics and error reporting](/faqs/analytics-and-error-reporting) |
| "Paddle keys aren't set on this deployment, so refunds are unavailable." in Plan & billing | Normal for now. You cannot refund a card payment from here |
| Plans with "(no Paddle price)" next to them in Plan & billing | The plan has no Paddle price attached. It can be granted by hand but not switched onto |

These messages are not faults. Do not try to fix them. They go away when the owner finishes Paddle setup. Whether Paddle is set up on a given address is not visible to staff, so trust the banner on the page.

## The Subscriptions page

A read-only list of memberships, newest first.

Four boxes sit above the table:

| Box | Counts |
|---|---|
| Memberships | Every membership in the list |
| Granted by staff | Plans a Steward granted by hand that are still in force |
| Receipts on file | Memberships with a Mila receipt |
| Paid, no receipt yet | Memberships with a payment but no Mila receipt |

The table shows one row per membership:

| Column | What it shows |
|---|---|
| Member | Name and email |
| Plan | The plan title. "Granted by the Mila team" appears for a granted plan still in force |
| Status | Active, Trialing, Past due, Canceled or Paused. An active plan that is set to cancel carries an "ends" note. A hand-granted plan in force reads "Granted" |
| Started | When the membership began |
| Expires | The end of the paid period, with "expired" in red if it has passed. A granted plan has no end date |
| Paid | The amount and date of the payment on file |
| Invoice, Receipt | Two buttons, described below |

Search looks at name, email, plan and status. Click a heading such as Member, Plan or Expires to sort. The **Refresh** button reloads.

### Invoice and Receipt buttons

- **Invoice** opens Paddle's own PDF invoice in a new tab. It needs Paddle to be set up and a payment to exist, otherwise it is greyed out, and hovering over it says there is no Paddle invoice for this membership yet.
- **Receipt** opens Mila's own receipt PDF in a new tab. It is greyed out until a payment has landed.
- Both open through a temporary signed link. The receipt link lasts 10 minutes. Do not copy or forward these links, because they open a member's billing document.

### Limits

The page loads the 500 newest memberships and reads member emails from up to the first 1,000 accounts. If it cuts the list, a note says "Showing the N newest of M memberships."

| | Behaviour |
|---|---|
| Live today | A staff-granted plan keeps its "Granted" label and its "Granted by the Mila team" line even after it has been ended, and the Granted by staff box counts ended grants too |
| After the nicoleDev release | "Granted" shows only while the plan is in force. An ended grant is labelled as ended, like any other membership |

## The Plans page

The catalogue of plans. Changes to an active plan reach members within about a minute.

| Column | What it shows |
|---|---|
| Order | Up and down arrows and the position. This is the order members see |
| Plan | Title, slug, and an Archived tag if archived |
| Price | The price and the interval (Monthly, Yearly or One-time) |
| Credits | Credits included, shown to members as credits per day |
| Active | Switch. On means members can see and choose the plan |
| Featured | Switch. Marks the one "Recommended" plan |
| Updated | When the plan last changed |
| (menu) | Edit, Archive or Restore, Delete |

Search looks at title and slug.

### Create a plan

1. Press **Create Plan**.
2. Fill in the form.

| Field | Rule |
|---|---|
| Title | Required, up to 80 characters. The slug fills in from it |
| Slug | Lowercase letters, numbers and single hyphens, 2 to 60 characters. The form warns not to change it casually on an existing plan |
| Description | Up to 280 characters |
| Price | A number like 14.99, up to 1,000,000. It is stored in cents. The form lets you type more, but saving a larger price fails |
| Currency | A 3-letter code, such as usd |
| Billing Interval | Monthly, Yearly or One-time |
| Credits Included | A whole number from 0 to 1,000,000. Members see it as credits per day |
| Features | One per line, up to 12 lines of 120 characters. They show as bullet points on the public plan |
| Sort Order | A whole number, 0 to 9999 |
| Active | Off by default. Leave it off to prepare a draft |
| Featured | Turning it on turns it off on every other plan |

3. Press **Create Plan**. You see "Plan created."

> **Note:** The form has no field for Paddle product or price ids. A new plan therefore has no Paddle price, so a member cannot pay for it even when Paddle goes live, until the owner adds the ids in the database. Plans that exist already may carry them.

### Edit a plan

Open the row menu, choose **Edit**, change the fields and press **Save Changes**. You see "Plan updated." Undo by editing back.

### Show, hide or feature a plan

Use the **Active** and **Featured** switches. You see "(plan) is now public." or "is now hidden.", and "is now featured." or "is no longer featured." Only one plan can be featured at once. Both switches are disabled on an archived plan.

> **Important:** Before you switch a plan off, or archive it, check that no member holds it. The member app can only read plans that are switched on and not archived. A member who still holds a hidden or archived plan can have her daily allowance drop to 0 credits, and the member app shows her on the Free tier. Purchased credits are not affected, and her membership row stays. The Members page in this admin app still shows the plan's credits, so it will not warn you. A database fix is written and waiting for the owner. Until it is applied, only hide or archive a plan nobody holds. You can check in Subscriptions by searching the plan name.

### Reorder

Use the arrows in the Order column. You see "Order updated."

### Archive, restore or delete

- **Archive** hides the plan, turns off Active and Featured, and keeps the record. You see "(plan) archived." Choose **Restore** to bring it back. It comes back inactive, so switch Active on again. The warning above applies to archiving too.
- **Delete** removes the plan permanently after a browser question. If any membership uses the plan, the database refuses and the message says to archive it instead.

> **Important:** Delete cannot be undone. Choose Archive unless the plan was created by mistake and nobody has ever held it.

## Plan and billing on the Members page

Open Members, then the row menu, then **Plan & billing**. The window changes with the member's plan.

| The member has | The window offers | Paddle involved |
|---|---|---|
| No live plan | Choose a plan and a note, then **Grant plan** | No |
| A plan a Steward granted | Change to another plan (**Update plan**) or **End plan** | No |
| A paid Paddle subscription | Cancel, switch plan, and optionally refund the latest payment in full | Yes, needs Paddle set up |

### Grant a plan by hand

1. Open **Plan & billing** on the member.
2. Pick an active plan. The window shows how many credits a day it gives and says purchased credits are untouched.
3. Add a note. It is saved in the audit log. Up to 200 characters.
4. Press **Grant plan**. You see "(plan) granted" with the daily credits and "No Paddle billing involved."

The member gets the plan's daily credits and the community verified badge, with no end date and no payment. The member app shows the plan as granted by the Mila team and offers no self-service cancel. If the member already has a paid Paddle subscription, the grant is refused.

To change it later, choose another plan and press **Update plan**. To stop it, press **End plan**. You see that the member is back to no plan. Undo by granting again.

For how many credits that means and how they behave, see [Credits and refunds](/faqs/credits-and-refunds) and [Adding credits](/faqs/adding-credits).

### Refund and cancel a paid subscription

This only works for a subscription that was paid through Paddle, and only once Paddle is set up. A payment refund here is money going back to the member's card. It is not the same as returning a styling credit, which is explained in [Credits and refunds](/faqs/credits-and-refunds).

1. Open **Plan & billing**. Choose **Cancel subscription** or **Switch to another plan**.
2. To refund, tick **Refund the latest payment in full via Paddle**. If Paddle already holds a refund for that payment, the box is off and says so, so a second refund cannot be sent.
3. Edit the reason. It is saved in the audit log and sent to Paddle.
4. Press **Apply change** (or **Refund & apply**).

With a refund, the cancel is immediate. A cancel without a refund runs to the end of the paid period. A switch is sent to Paddle straight away with billing set to "do not bill", so the member is neither charged for an upgrade nor credited for unused time. The message reports Paddle's own status (approved, or awaiting Paddle's approval), because the money has not necessarily landed yet.

## Common questions

**A member says they cannot pay. What do I do?** Paddle is not live, so they cannot. If you want them on a plan, grant one by hand.

**Why does a plan show a price but nobody can buy it?** Because checkout is off, and the Plans form cannot attach a Paddle price.

**Can I change the price of a plan that members already hold?** The price field edits the catalogue. It does not change what anyone has paid.

**Where is the money total?** On Analytics, which needs Paddle. See [Analytics and error reporting](/faqs/analytics-and-error-reporting).
