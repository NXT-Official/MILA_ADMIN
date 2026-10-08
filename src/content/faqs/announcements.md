---
title: Announcements
category: Community & moderation
summary: How to write and send a Mila update email to every member, what a dry run means, and why nothing is delivered until a mail key is set up.
tags: [announcements, email, update, dryrun, resend, members, noreply]
order: 20
updated: 2026-10-07
status: partly-live
---

The Announcements page emails every member a Mila update, such as "We shipped three things this week".

> **Important:** Email is not set up yet. No domain has been bought for Mila, so there is no mail key (`RESEND_API_KEY`) on the app. Until the owner sets one, pressing Send does a **dry run**: it records the update and delivers nothing. Members receive no email. See [Analytics and error reporting](/faqs/analytics-and-error-reporting) for the full email status.

## Who can use it

Stewards only. Moderators do not see Announcements.

## What the page shows

Two panels side by side.

**Write the update** (left)

- **Subject:** 3 to 120 characters.
- **Message:** 10 to 8,000 characters. A blank line starts a new paragraph. A single line break stays a line break. Under the box you see the paragraph and character counts.
- A tick box: "Send this to N members. I understand it goes out immediately and can't be unsent." N is the number of eligible members. If it is over 500, only 500 receive this send.
- The **Send update** button.

| | When the subject or message is too short |
|---|---|
| Live today | No hint appears. Send can be pressed with a message under 10 characters, and the server refuses it with a technical error. Keep the subject at 3 or more characters and the message at 10 or more. |
| After the nicoleDev release | A grey hint appears under the box in plain words, and the button stays off until the update would be accepted. |

**What members see** (right) shows the plain-text version of the email as you type: "Mila", your subject, your paragraphs, and a footer. The footer says the message is automated, comes from a noreply address, replies are not monitored, and the help desk in the app reaches a person.

Members really receive a styled email as well as a plain-text copy. The preview shows the words of both, with a slightly shorter footer in the plain-text copy.

## Who receives it

- Every member with an email address, except suspended accounts. Below the form a line says how many suspended accounts are skipped.
- A single send reaches at most 500 members. If there are more, the result notes that only the newest members were included this run, and the rest are not emailed. Do not send the same update again to reach the rest, because the app does not remember who already received it and the same first 500 would be emailed again. Ask the owner before sending to an audience larger than 500.
- The sender is Mila's noreply address. Replies are not monitored, so give people another way to answer, such as the help desk in the app. See [Support inbox](/faqs/support-inbox).

## Send an update

1. Write a clear subject and message. Read it through in the preview.
2. Tick the confirmation box. It shows the number of eligible members, which can be more than the 500 one send reaches.
3. Press **Send update**.
4. Read the result panel. It tells you how many were delivered, failed and skipped, and how many recipients there were. If any failed, up to five failures are listed with the member's email and the reason. Those are member emails, so do not paste them into chat.

| Result you see | Meaning |
|---|---|
| "Sent to N members." and the form clears | Every email was accepted for delivery |
| "Sent to N, M failed." | Some were not accepted. The form keeps your text |
| "Nothing was sent: this deployment has no mail key yet." and a result heading that starts with "Dry run" | A dry run. No one received anything. The form keeps your text |

A red box under the form says "No mail key on this deployment (`RESEND_API_KEY`), so sending records the update and delivers nothing." when the key is missing. It also shows the sender address. When this box is showing, Send is safe.

> **Important:** Once a mail key exists, Send emails real members straight away and it cannot be unsent. There is no schedule, no test send and no undo. Read the preview twice, and only press Send when you mean it.

## Undo and records

There is no undo. A dry run changes nothing for members, so it can be repeated.

Every send, including a dry run, writes a line to the staff audit log with your account, the subject, and the counts for recipients, sent, failed and skipped. The log does not keep the message body.

## What changes for the member

| | Member receives |
|---|---|
| Live today | Nothing, because there is no mail key |
| After a mail key is set | One email with your subject and message |

## Other emails that are also off

With no mail key, the member app skips its own emails (password changed, account deleted, payment receipts) and carries on without error. Password reset links come from a different system. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

## Common questions

**I pressed Send and it says nothing was sent. Did it break?** No. That is the dry run. It means no mail key is set up yet.

**Can I send to one person or a group?** No. It always goes to every eligible member.

**Can I schedule it for later?** No.

**Can I attach an image or add a link?** The body is plain text. A web address you type is shown as text.

**How do I know it reached people once email is live?** The result panel shows delivered and failed counts. Individual inboxes are not visible here.
