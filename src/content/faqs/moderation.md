---
title: Moderation
category: Community & moderation
summary: How to review feed posts, hide or restore them with a reason, delete them for good, and what the member sees when you do.
tags: [moderation, posts, hide, restore, delete, feed, reports, reason]
order: 10
updated: 2026-10-07
status: live
---

Moderation is where staff look after the community feed. You can hide a post from everyone else, bring it back, or delete it for good.

## Who can use it

Stewards and Moderators can both open Moderation and use every button on it.

One difference: Stewards see the author's email under the name on each card. Moderators see the name only.

## What the page shows

- Two tabs: **Feed** (posts everyone can see) and **Hidden Feed** (posts a moderator has hidden). Each tab shows its count, for example "Feed (12)", and the line under the tabs shows "entries" for the open tab.
- One card per post, newest first, with:
  - the main outfit photo (hidden posts are greyed out and carry a red **Hidden** tag),
  - the author's name,
  - the caption, cut to three lines,
  - on a hidden post, "Reason:" and the reason you gave, or "No reason was provided.",
  - a **Hide** (or **Restore**) button and a bin icon for **Delete**.
- Empty tabs say "No visible posts." or "No hidden posts."

> **Important:** The page loads the 200 newest posts only. Older posts do not appear.

> **Note:** The cards show members' photos and, for Stewards, their emails. Do not screenshot them or pass them on. The privacy rules in [Database browser](/faqs/database-browser) apply here too.

> **Note:** The card shows the main outfit photo only. On the member site a post can also carry a small round portrait in the corner, and you cannot see that portrait here. The photos load through links that stop working after one hour. If the photos go blank, reload the page.

## There is no reports queue

Members cannot report a post today, and the admin app has no Reports tab. Moderation here means reviewing the feed yourself. If a member tells Mila about a post, it will arrive as an anonymous message in [Support inbox](/faqs/support-inbox), and you then find the post in the feed.

## Hide a post

Hiding takes a post out of the feed for everyone, its author included. Only the author (on her own profile) and staff can still see it. It is reversible.

1. Open the **Feed** tab and find the post.
2. Press **Hide**.
3. A box asks "Reason for hiding (optional):". Type a reason and press **OK**. The reason can be up to 280 characters.
4. You see "Post hidden from feed." The post moves to **Hidden Feed**.

What the member sees:

- Everyone else no longer sees the post in the feed or on the author's profile.
- The author still sees it on her own profile: on the member site under a **Hidden Feed** tab, and in the mobile app under a **Hidden** tab, where she opens the post. It sits under a "Hidden post" box with "Reason:" and your words. **Write the reason as if the member will read it, because they will.**
- The member is not sent any message or notification. They find out only if they open their own profile.

> **Important:** Press **OK** to hide, never **Cancel**. What Cancel does depends on the version, shown below.

| | Pressing Cancel on the reason box |
|---|---|
| Live today | The post is still hidden, with no reason. |
| After the nicoleDev release | Nothing happens. The post stays visible. |

If you want to hide with no reason, press **OK** with the box empty. The post shows "No reason was provided."

## Restore a hidden post

1. Open **Hidden Feed**.
2. Press **Restore** on the post. There is no question and no reason.
3. You see "Post restored." The post is back in the feed, and the old reason is cleared.

## Delete a post for good

Deleting is permanent. Hide first if you are unsure.

1. Press the bin icon on the card.
2. A browser box asks "Delete this post permanently? This cannot be undone." Press **OK**.
3. You see "Post deleted." The post disappears from both tabs and from the author's profile.

There is no undo. The author is not told. The audit log keeps a line saying a post was deleted, but not what it contained.

> **Note:** The admin delete removes the post record. The code does not remove the stored photo files. When a member deletes their own post in the member app, the photos are removed as well.

## Everything is recorded

Hiding, restoring and deleting each write a line to the staff audit log with your account, the post and (for hiding) the reason. Stewards can read the log in Database, in the `staff_audit_log` table.

## What each action changes for the member

| Action | Everyone else | The author | Undo |
|---|---|---|---|
| Hide | Post gone from the feed | Sees it under Hidden Feed with the reason | Restore |
| Restore | Post visible again | Post leaves Hidden Feed | Hide again |
| Delete | Post gone | Post gone | None |

## Common questions

**A post I hid is visible again. What do I do?** Hide it again and tell the owner which post it was and when you noticed. See [Known issues and owner actions](/faqs/known-issues-and-owner-actions).

**Should I suspend the member as well?** Suspending a member does not remove their posts from the feed. Hide the posts too. See [Members and roles](/faqs/members-and-roles).

**Can I edit a caption?** No. You can only hide, restore or delete.

**Why did I not see an email under the author?** Only Stewards see emails here.

**I pressed Cancel on the reason box and the post was hidden anyway.** That is how the live site works today. Restore the post if you did not mean to hide it, and see the table above.
