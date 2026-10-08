---
title: Members and roles
category: Members & accounts
summary: How to find a member, give or remove the Steward and Moderator roles, suspend or reinstate, edit, add or delete an account, and where credits fit in.
tags: [members, roles, steward, moderator, suspend, reinstate, delete, search, credits]
order: 10
updated: 2026-10-07
status: live
---

The Members page is where Stewards look after accounts. This article covers the page, every action on it, and what each action does for the member.

## Who can use it

Stewards only. A Moderator does not see Members in the sidebar, and the server refuses the page's requests if they try to open it another way. See [Start here](/faqs/start-here) for the two roles.

## What the page shows

At the top, two boxes remind you what the roles mean.

| Role | Meaning on this page |
|---|---|
| Steward | Full administrative access, including member and role management |
| Moderator | Access to moderation and support tools without full administrative control |

Below them is one table with a search box and an **Add Member** button.

| Column | What it shows |
|---|---|
| Member | Full name (or username, or "Unnamed") and the @username |
| Email | The sign-in email |
| Credits | Her credit number. Live today it is her stored daily credits plus purchased credits, which can be yesterday's leftover or credits from a plan that has ended. After the nicoleDev release it is what she can spend today. For the rules see [Credits and refunds](/faqs/credits-and-refunds) |
| Steward | A switch for the Steward role |
| Moderator | A switch for the Moderator role |
| Status | A red "Suspended" tag, empty for active members |
| (menu) | The row menu, labelled "Open actions" |

There is no separate member detail page. What you can see about a member is this row, plus the **Plan & billing** and **Add styling credits** windows from the row menu.

> **Note:** This page lists members' names and emails. Do not screenshot it or share it. The privacy rules in [Database browser](/faqs/database-browser) apply here too.

> **Important:** The page loads the first 200 accounts only. If Mila grows past 200 members, search and the table cannot reach the rest. The Total Members card on the Dashboard counts every profile, so it can be higher than the table. Tell the owner if the two numbers stop matching.

## Find a member

1. Type in the search box ("Search by name, username, or email").
2. The table narrows as you type. It matches any part of the name, username or email, and ignores capital letters.
3. Click the Member, Email or Credits heading to sort. Use Previous and Next under the table if there is more than one page.

## Give or take away a role

1. Find the member.
2. Switch **Steward** or **Moderator** on or off in their row.
3. A window asks you to confirm. It names the member and says what changes. Press **Confirm**, or **Cancel** to stop.
4. A message appears: "Steward role granted.", "Moderator role revoked." and so on. If the member already had, or did not have, that role you are told that instead.

What the rules are:

- You cannot take the Steward role away from yourself. Your own Steward switch is greyed out.
- Mila must always have at least one active Steward. Taking the last one away is refused with "Mila must always have at least one active Steward."
- You cannot give a role to a suspended member. You see "Reinstate this member before assigning a staff role." Taking a role away from a suspended member is allowed.

What the member gets:

- **Moderator:** the person can sign in to the admin app with their usual email and password and sees Moderation, Support, FAQs (Training) and Settings. In the member app a Moderator (and a Steward) can also see hidden posts on any member's profile, with the reason each was hidden.
- **Steward:** everything in the admin app.
- When a role is removed, the next action the person tries in the admin app is refused. If their menu still shows old pages, ask them to reload.

Undo: switch the role back. Every grant and revoke is written to the staff audit log.

## Suspend or reinstate a member

Suspending stops a member using Mila without deleting anything.

1. Open the row menu and choose **Suspend**.
2. A window asks: "Suspend (name)? They won't be able to sign in until you reinstate them. Nothing is deleted, and you can reinstate them from the same menu." Press **Suspend** to confirm.
3. You see "Member suspended." and a red Suspended tag appears in the row.

To undo, open the row menu and choose **Reinstate**. It takes one click and has no confirmation. You see "Member reinstated."

What the member sees: a full-screen block instead of the app. On the web it says "Membership Suspended" with a Contact Steward button. On mobile it says "Your account is on hold". The app's requests to the Mila server are refused while the account is suspended. Their posts, looks and credits stay as they were.

> **Important:** Suspending does not remove a member's posts from the feed. If a post is the problem, hide it as well in [Moderation](/faqs/moderation).

Rules: you cannot suspend your own account (the menu item is greyed out). You cannot reinstate yourself either: a suspended Steward sees the suspended screen in the admin app, and the server only accepts a reinstatement from an active Steward, so another Steward has to do it. The last active Steward cannot be suspended.

| | Behaviour |
|---|---|
| Live today | Suspend happens on a single click with no confirmation window, and the menu does not stop you suspending yourself. If you suspend yourself you are locked out at once, and another Steward has to reinstate you |
| After the nicoleDev release | Suspend asks first in the window above, and your own Suspend item is greyed out |

> **Note:** The Contact Steward button on the member site opens an email to a fixed address, and the mobile screen opens an email to a different one. Neither address is a staff inbox that this app manages, so a suspended member may not be able to reach you that way. If someone asks to be reinstated, they will usually find you through another channel.

## Edit a member

1. Open the row menu and choose **Edit**.
2. Change **Full Name** or **Username**. The email and password cannot be changed here.
3. Press **Save Changes**. You see "Member updated."

Rules: names can be up to 100 characters. A username is 3 to 30 characters of letters, numbers, `-` and `_`. You can empty the username field to clear it. A taken username is refused with "Username already taken."

What the member sees: the new name appears on their posts and profile. Undo by editing it back.

## Add a member

Use this for someone who cannot sign up themselves, such as a colleague who needs a staff login. Ordinary members sign up in the app.

1. Press **Add Member** above the table.
2. Enter an email and a password of at least 8 characters. Full name and username are optional.
3. Press **Create Member**. You see "Member created."

The account is confirmed at once, so the person can sign in immediately. Give them the password through a private channel and ask them to change it in the app. To make them staff, switch on a role in their row afterwards.

## Delete a member

Deleting is permanent. Prefer suspending.

1. Open the row menu and choose **Delete**. It is not shown on your own row.
2. A window says this permanently deletes the account and everything attached to it: profile, credits, posts and looks. It cannot be undone.
3. Press **Delete Account**. You see "(name)'s account deleted."

When Delete is greyed out: the account has acted as staff (it has staff action history), so the database will not allow the delete. Revoke its roles and suspend it instead. The last active Steward cannot be deleted either.

There is no undo. The audit log keeps a `member.deleted` line with the email and name.

## Add styling credits

Use **Add styling credits** in the row menu to give a member credits by hand. The rules about how many, why, and how they interact with refunds are in [Adding credits](/faqs/adding-credits) and [Credits and refunds](/faqs/credits-and-refunds). Read them before you grant anything. Every grant is written to the audit log with the note you type.

## Plan and billing

**Plan & billing** in the row menu grants a plan by hand, ends a granted plan, or refunds and changes a paid one. It is covered in [Subscriptions and plans](/faqs/subscriptions-and-plans). Paddle payments are not live yet.

## What each action changes for the member

| Action | Effect for the member | Undo |
|---|---|---|
| Grant or revoke Moderator | Can use Moderation, Support, FAQs (Training) and Settings in the admin app, and sees hidden posts in the member app | Switch it back |
| Grant or revoke Steward | Full admin access, or none | Switch it back |
| Suspend | Locked out of the app behind a block screen | Reinstate |
| Reinstate | Can use the app again | Suspend again |
| Edit | New name or username shows on their profile and posts | Edit again |
| Add Member | A new account exists and works at once | Delete it, or suspend it |
| Delete | Account and all its data gone | None |
| Add styling credits | Balance goes up | See [Adding credits](/faqs/adding-credits) |

## Common questions

**Why do the Members column numbers not add up to the Dashboard card?** The card adds the stored numbers for every member. After the nicoleDev release the column shows what each member can spend today, so the two can differ. Live today both use the stored numbers, so they differ only when Mila has more than 200 accounts (the list shows the first 200).

**A member says they cannot sign in. Is it a suspension?** Look for the red Suspended tag in their row. If there is none, see [Sign-in and sessions](/faqs/sign-in-and-sessions).

**Can I see someone's password?** No. Passwords are never shown.

**Can I change a member's email?** Not from this page.

**Where can I see who changed a role or suspended someone?** In Database, open the `staff_audit_log` table. See [Database browser](/faqs/database-browser), and mind the privacy rules there.
