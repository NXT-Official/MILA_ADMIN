---
title: Generations and tab switching
category: AI features
summary: What happens to a look, style sheet or portrait when a member leaves the page, switches tabs or presses twice, today and after the nicoleDev release.
tags: [generation, look, style-sheet, portrait, tabs, refunds, running, reaper, jobs]
order: 10
updated: 2026-10-07
status: partly-live
---

A "generation" is one of the slow AI requests on the dashboard: **Create my look**, the **style sheet**, and the **portrait preview**. A look usually takes about 2 to 3 minutes from the click to the picture, and can take longer: her screen waits up to 4 minutes for the look and up to about 5 more minutes for its picture before it gives up, so members often switch tabs or leave the page while they wait.

This article covers what happens to the request and to her credit when she does. The short answer: the **server side is fixed in the nicoleDev release**, but **her screen does not yet show a request lost to a reload or a closed tab**. That screen work is still to come, on web and on mobile.

## What costs what

| Request | Cost |
|---|---|
| Create my look | 1 credit |
| Style sheet or portrait preview | The first one after each new look is free, then 1 credit each |

The credit rules themselves are in [Credits and refunds](/faqs/credits-and-refunds).

## Live today

On the live site nothing about a generation is saved on the server until it reaches her screen. That causes these problems:

- **Leaving the dashboard hides the progress.** If she goes to another page in Mila and comes back while it is still working, she sees an empty form with no progress showing. The request keeps going, and the look appears on the dashboard when it finishes, as long as the page has not reloaded and she has not been sent to the sign-in or onboarding page. If she presses Create on that empty form, she starts a second request and is charged again.
- **Reloading, closing the tab, or the browser discarding a background tab** loses the result. The server still finishes the work and the credit is still spent, but the result never reaches her.
- **Pressing Create again** starts a second, separately charged request.
- **A request the server cuts off** at its time limit is **not refunded**, and if it was her free style sheet or portrait, the free one does not come back either.
- **Coming back to the tab** can reset pages that depend on her account. The Style Profile could lose unsaved edits and History could reload. If her sign-in could not be refreshed at that moment, she could see **0 credits**, be sent to onboarding, or be sent to the sign-in page.
- **Her balance** can look different from her plan's daily amount because of a known credits issue. See [Credits and refunds](/faqs/credits-and-refunds).

The mobile app talks to the same server, so the same server behaviour applies there.

## After the nicoleDev release: the server side

Once the code is merged and the migration `20261007143000_generation_jobs.sql` is applied, every look, style sheet and portrait becomes a **generation job**: a record in the database that follows the request from start to finish.

### One charge per request

- The job is created and charged in one step. A charge without a job cannot exist.
- The server saves the result (and the image, in a private storage folder only she can read) **before** it answers.
- If she presses again with the **same choices** while the job is running (from a second tab, or after leaving and coming back, since the button is greyed out on the page that started it), she **joins the same job**. She gets the same result and is **not charged again**. "Same choices" includes the vibe, the optional fields and the weather reading, so if any of them differ she gets the "still finishing" message instead, also with no charge.

### "Already running": a different request while one runs

Only one job of each kind (look, style sheet, portrait) runs at a time per member.

- A request with **different choices** while one of the same kind is running is refused, and she is **not charged**. On the web she sees **"Mila is still finishing your last request. Try again in a moment."** In the phone app she sees **"Mila needs a moment. Try again in ..."**.
- If she joined a running job and it is still not finished after about 4 minutes 30 seconds, she gets the same message, again with no charge. For a look on the web, her screen gives up first, after 4 minutes, with "This is taking longer than expected. Please refresh and try again." If the job she joined was cut off, she may get the usual failure message instead.
- On the server, different kinds can run side by side, so a running portrait does not block a new look. After the release, the web dashboard still greys out **Create my look** while a style sheet or portrait is drawing on that page.

### Failures and refunds

- **A failure is refunded once.** When the server fails a request itself, the credit goes back at once to the kind it came from: purchased to purchased, and a daily credit charged today back to today's daily credits in full. A daily credit charged before the 8:00 am reset and refunded after it follows the midnight rule in [Credits and refunds](/faqs/credits-and-refunds). A request the server was cut off on is refunded only when the reaper finds it (see below).
- **Free visual.** If the request used her free style sheet or portrait and the server fails it itself, the free one comes back instead of a credit. A request that was cut off and reaped does not give the free one back.
- **Finished but not saved.** If the server finished but could not save its copy (it tries twice), it still sends the result to her screen and keeps the charge, because she received what she paid for. This is logged for the team. If she had already left the page, that result is lost and there is no saved copy to show later; ask the owner. In the rare case the database could not be reached at all, the credit is refunded later by the reaper.

### The reaper: requests the server cut off

Sometimes the server stops a request before it finishes, for example at the hosting time limit. The **reaper** finds these:

- If the server is still running when a job reaches its time limit (about 4 minutes 45 seconds), it fails the job itself and refunds it at once.
- If the server was cut off, the job stays "running" until the reaper finds it. A job can be reaped 5 minutes 30 seconds after it started, but the reaper only runs when she next starts a look, style sheet or portrait, or at the daily cleanup at 00:05 UTC (8:05 am Philippine time). Nothing on her screen runs it, and it only works once the generation jobs migration is applied.
- What comes back: a purchased credit comes back in full. A daily credit charged and reaped on the same credit day comes back in full. A daily credit reaped after the 8:00 am reset (always the case at the daily cleanup) follows the midnight rule: it is added at her next charged action only up to her plan's daily amount, so it is usually absorbed. A free style sheet or portrait used by a reaped job does not come back.
- Do not promise a refund by a set time. For a specific job, ask the owner.

### Tab switching and sign-in

Separately from jobs, the nicoleDev release fixes the sign-in side of tab switching on the web:

- Coming back to a tab no longer reloads her pages or overwrites unsaved Style Profile edits.
- A failed sign-in refresh no longer makes her credits read as 0, or her profile look empty (which used to send a finished member to onboarding).
- A dropped connection keeps her signed in. See [Sign-in and sessions](/faqs/sign-in-and-sessions).

## What her screen does not show yet

The web and mobile screens have not been changed to read generation jobs. That work is still to come. Until it ships:

| She does this | What happens on the server | What she sees |
|---|---|---|
| Leaves the dashboard while a look runs, then comes back | The look keeps running, the outfit is saved privately, and it is charged once | If she only moved to another page in Mila: an empty form with no progress while it runs, then the look and its picture appear when they finish. Not in her History unless she saves it |
| Presses Create again with the same choices while the first is still running (from a second tab, or after coming back) | She joins the first job. No second charge | The first job's result, when it finishes |
| Presses Create again after the first has already finished | A **new** request, charged again (the same as today) | A new look |
| Presses Create with different choices while one runs | Refused, no charge | Web: "Mila is still finishing your last request. Try again in a moment." Phone app: "Mila needs a moment. Try again in ..." |
| Reloads the page, closes the tab, or the browser discards the tab | The look keeps running, the outfit is saved privately, and it is charged once. Its picture is never drawn, because her screen asks for the picture only after the look arrives | An empty form. The look is never shown |

There is also no "you can leave this page" message yet, and no way for her to see a list of her running or finished jobs.

> **Note:** No mobile app build knows about jobs yet, including the newest one. The server still handles them: a request with the same choices as one already running waits for that result instead of being charged again, and a request with different choices is refused with "Mila needs a moment. Try again in ..." and no charge. Before the release, both would have started a second, charged request.

## What to tell the member

**"I switched tabs and my look disappeared."**
- Live today: "Sorry about that. If you only went to another page in Mila, go back to the dashboard and give it a few minutes before pressing Create again, because your look may still appear there. If the page reloaded or you were signed out while it was working, that look can't be brought back, and the credit was usually still used. I'll ask the team to check your credits. For now, please stay on the dashboard until your look appears." Do not promise an automatic refund. Check her balance and tell the owner.
- After the release: "Your look kept going after you left, and you were only charged once. If you only moved to another page in Mila, go back to the dashboard and give it a few minutes; it may still appear there. If the page reloaded or was closed, the screen can't show that look yet. If you press Create again after it has finished, that's a new look and uses another credit." Do not suggest pressing Create again to get the first look back.

**"It says Mila is still finishing my last request."** (web), or after the release **"It says Mila needs a moment."** (phone app)
"Your last request is still running, and you haven't been charged for this one. Please wait a few minutes, then try again."

**"I was charged but got nothing."**
"I'm sorry about that. I'll check your credits and ask the team to look at what happened to that request." Do not promise a refund or a time.
- Live today: a request she left, or one that finished after her page reloaded, was completed and charged but never shown. It is not refunded. A request the server cut off is not refunded either. Check her balance (see [Credits and refunds](/faqs/credits-and-refunds)) and tell the owner.
- After the release: a request she left usually finished, was charged once and was saved, but her screen cannot show it after a reload yet, so it is not refunded. A request the server failed while it was still running is refunded at once. A request the server was cut off on is refunded only when she next starts a look, style sheet or portrait, or at the 8:05 am cleanup. A daily credit returned after the 8:00 am reset follows the midnight rule and usually adds nothing. A free style sheet or portrait does not come back this way. Staff cannot see jobs, so ask the owner to check the specific request.

**"Can I leave the page while it works?"**
- Live today: "Please stay on the page until your look appears."
- After the release: still recommend staying on the dashboard until the look appears. Moving to another Mila page and back is fine, but after a reload or a closed tab the screen can't show the look yet.

## How to check

Staff cannot see generation jobs in admin. The `generation_jobs` table is not in the database browser. You can check her balance (see "How to check in admin" in [Credits and refunds](/faqs/credits-and-refunds)). For a question about one specific job, ask the owner.

## Related articles

- [Credits and refunds](/faqs/credits-and-refunds)
- [Sign-in and sessions](/faqs/sign-in-and-sessions)
- [Environments and releases](/faqs/environments-and-releases)
- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
