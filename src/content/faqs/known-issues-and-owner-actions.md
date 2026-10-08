---
title: Known issues and owner actions
category: Platform & releases
summary: A checklist of the steps only the owner can take, and the known gaps members may notice, live today and after the nicoleDev release.
tags: [known-issues, owner, checklist, release, migrations, gaps, security, catalogue]
order: 20
updated: 2026-10-07
status: live
---

This page lists what is known to be missing or wrong, and the steps only the owner can take. Use it to answer "is this a known problem?" before escalating.

Status as of 2026-10-07. A ticked box is done; an unticked box is still open.

## Owner actions

### The release

- [ ] **Merge `nicoleDev` into `main`** for the web and admin apps. Nothing in the next release reaches members until this happens. See [Environments and releases](/faqs/environments-and-releases).
- [ ] **Apply `20261007120000_saved_products.sql`** to turn on Saved pieces.
- [ ] **Apply `20261007143000_generation_jobs.sql` and `20261007170000_tracked_ai_credit_refunds.sql`.** Both are needed for the credit fix. Until they are applied and the release is merged, the live credits issue continues. See [Credits and refunds](/faqs/credits-and-refunds).
- [ ] **Decide what happens to the purchased credits that no staff grant explains.** This is a data decision for the owner. Staff must not remove them or promise to keep them.
- [ ] **Build and release a new mobile app** with the owner's team account, so mobile members get the fixes.

### Security

- [ ] **Confirm the three seeded accounts are secured** (2026-10-06 audit, SEC-1). Owner only.
- [ ] **Review and apply the pending database access changes** from the 2026-10-06 audit, including the plan-reading fix in [Subscriptions and plans](/faqs/subscriptions-and-plans). Owner only.
- [ ] **Mobile sign-in links** (SEC-5): planned update after the demo. Owner only.
- [ ] **Member photos storage** (SEC-4): planned privacy change after the demo. Until it is done, make no promises to a member about who can see her uploaded photos; tell the owner if she asks.

### Settings and accounts

- [x] **Allow sign-in links to return to the nicoleDev previews.** Done on 2026-10-07.
- [ ] **Optional:** also allow a developer's own computer, so Google sign-in can be tested locally.
- [ ] **Set up a custom email provider** (a sending domain). Until then, password reset and email change messages go through Supabase's built-in mailer, which only reaches the project's team and sends at most 2 an hour.
- [ ] **Confirm error reporting and analytics are arriving, and that live admin is not sending member data.** On 2026-10-07 the live web and admin apps were redeployed to pick up Sentry keys, PostHog was added to the live web and mobile code, and Sentry and PostHog were wired into the mobile build settings. The live admin app's error reporting has no member-data cleaning until the nicoleDev release: either merge the release or unset the live admin Sentry address until then. Firebase is still planned. See [Analytics and error reporting](/faqs/analytics-and-error-reporting).
- [ ] **PostHog address cleaning** is on nicoleDev, not yet live. Until it is merged, leave the web PostHog key unset and make no mobile store build from `main`, or merge the fix first. Then check what PostHog has already received from any deployment or build made since 2026-10-07.
- [ ] **Play Store data-safety form:** update it before the next store build. Builds made from `main` now send product analytics (PostHog, linked to the member's account) and crash reports (Sentry). Add Firebase when its project file is provided.
- [ ] **Decide how the nicoleDev previews should be tested.** They share the live database and have no AI key or server key. Options include adding keys or creating a separate free Supabase project for testing. Without the server key, staff cannot sign in to the admin preview at all (see [Environments and releases](/faqs/environments-and-releases)).
- [ ] **Payments:** plan checkout is not set up, so members cannot buy a plan yet.

### Product decisions

- [ ] **Starter credits:** new free accounts start with 0 credits. Decide whether they should get some.
- [ ] **Dupe Hunter research decisions** (seven, D1 to D7): what Dupe promises, which image model, garment cropping, a second AI check, catalogue growth, hosting and image rights. Nothing in the search method changes until these are made. See [Dupe Hunter](/faqs/dupe-hunter).
- [ ] **Dupe Hunter cut-offs** (60 for close, 90 for identical) need tuning on real member photos.
- [ ] **Dupe Hunter:** decide whether the department read from the photo should beat the gender in her profile.
- [ ] **Privacy and Terms pages** still show placeholder text, pending legal review.
- [ ] **Landing page:** publish the new landing copy in Sanity and choose a new hero image.

### Catalogue data

- [ ] **Recategorise the six products filed under the wrong category.** See [Saved pieces and garment badges](/faqs/saved-pieces-and-garment-badges).
- [ ] **Out-of-date shop links:** in the 2026-10-06 check, 10 of 842 product links were broken and about 175 products were sold out. They should be marked out of stock.
- [ ] **Test data:** confirm the "test" posts by "Mila User" are hidden in Moderation, and decide what to do with the QA test account left in production on 2026-10-06. See [Moderation](/faqs/moderation).

## Known gaps: live today

These affect members now. Each one is fixed in the nicoleDev release unless it says otherwise.

| Gap | Details |
|---|---|
| Purchased credits nobody added | Some members hold purchased credits no staff grant explains. Don't remove them, don't promise she can keep them, and tell the owner. [Credits and refunds](/faqs/credits-and-refunds) |
| A reload loses a look | Reloading, closing the tab or the browser discarding it loses a running look, style sheet or portrait, though the credit is still used. Moving to another Mila page does not: the look appears on the dashboard when it finishes. A request the server cuts off is not refunded. [Generations and tab switching](/faqs/generations-and-tab-switching) |
| Dupe Hunter shows unrelated pieces | Every product in the category counts as a match; bags and jewellery are searched as accessories; an empty hunt is charged. [Dupe Hunter](/faqs/dupe-hunter) |
| Sign out signs out everywhere | And a dropped connection sends her to sign in. [Sign-in and sessions](/faqs/sign-in-and-sessions) |
| Credits show 0 after returning to a tab | Her credits are safe. Once her connection is back, reloading the page shows them. [Sign-in and sessions](/faqs/sign-in-and-sessions) |
| A finished member is sent to onboarding | On web and mobile, if her profile fails to load (for example a network error at sign-in), she can be sent to onboarding. After the release she sees a Try again screen instead. [Sign-in and sessions](/faqs/sign-in-and-sessions) |
| New free accounts have 0 credits | Not fixed in the release; it is a product decision (above) |
| Password reset emails rarely arrive | Not fixed in the release; needs the email provider (above) |
| No garment badges or saved pieces | Garment badges arrive with the release. Saved pieces need the release and their database migration (above). |

## Known gaps: still open after the nicoleDev release

| Gap | Details |
|---|---|
| A look lost to a reload is not shown | The server finishes and saves it, but after a reload or a closed tab the screen still shows an empty form. The screen work is still to come, on web and mobile. |
| Pressing Create after a look finished charges again | Same as today. It goes away when the screen can show finished looks. |
| Dupe Hunter messages not on screen | The server explains "nothing close enough" and "hidden by your budget or region", but the screens still show the general "no matches" note. |
| Dupe Hunter review items | A review found patterned products appearing for plain pieces, and anklets bringing back necklaces. Both were fixed on `nicoleDev` on 2026-10-07. A second review then found a spiked bracelet described with the word "stud" appearing in earring hunts, and casual jersey pieces dropping out of casual hunts. Fixes for those were committed later the same day and still need review. |
| Owed refunds are invisible | A daily credit refunded after the 8:00 am reset is not added straight away. At her next charged action it tops today's daily credits back up, but never above her allowance. If today's daily credits are still full (she has not used any today) or her plan has ended, nothing is added. Staff cannot see refund records in admin. [Credits and refunds](/faqs/credits-and-refunds) |
| Free visual lost on a cut-off request | If a free style sheet or portrait is cut off and only cleaned up later, the free one is not given back. |
| Account export and deletion | Her data export does not include her generation jobs, and deleting an account does not remove her privately saved generation images. |
| Refund limit and failed refunds | If a Dupe refund is approved but writing it fails, that attempt still counts toward her 3 refunds in 24 hours. Rare. |

## Related articles

- [Environments and releases](/faqs/environments-and-releases)
- [Credits and refunds](/faqs/credits-and-refunds)
- [Sign-in and sessions](/faqs/sign-in-and-sessions)
- [Dupe Hunter](/faqs/dupe-hunter)
