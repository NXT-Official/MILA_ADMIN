---
title: Sign-in and sessions
category: Sign-in & sessions
summary: Troubleshooting sign-in for members. hCaptcha, Google, sign-out, Reconnecting, offline launches, hotel Wi-Fi, password resets and preview addresses.
tags: [sign-in, login, hcaptcha, google, sign-out, reconnecting, offline, password, session, wifi]
order: 10
updated: 2026-10-07
status: partly-live
---

This article helps you answer "I can't sign in" and "it keeps signing me out". Each item is marked:

- **Live**: how it works for members today;
- **Coming**: arrives with the nicoleDev release. On mobile it also needs a new app build, because members only get mobile changes when they install an update.

## At a glance

| Topic | Live today | After the nicoleDev release |
|---|---|---|
| hCaptcha | Live, required for email sign-in | Same |
| Web sign-in (Google or email) | Lands on the dashboard | Returns to the page she was on when asked to sign in |
| Sign out | Signs her out on **every** device | Signs her out on **this device only** |
| Web: sign-in can't be refreshed | Sent to the sign-in page | "Reconnecting" screen, still signed in |
| Web: coming back to a tab | Can reload pages, show 0 credits, or send her to onboarding | Nothing changes on the page |
| Web: her profile can't be read (offline or server trouble) | A finished member can be sent to onboarding | "Reconnecting" screen with Try again, never onboarding |
| Mobile: no connection at launch | Sent to the sign-in screen | "Still trying to reach Mila" screen after 5 seconds, still signed in |
| Mobile: her profile can't load at launch, after sign-in or from a sign-in link | A finished member can be sent to onboarding | "Still trying to reach Mila" with Try again after 5 seconds, never onboarding |
| Mobile: hotel or cafe Wi-Fi sign-in page | Can delete her session | Session kept |
| Password reset | Live, with email delivery limits | Same |
| nicoleDev preview sign-in links | Fixed on 2026-10-07 | Same |
| Google sign-in on a developer's own computer | Lands on the live site | Same |

## hCaptcha (Live)

Every email-and-password sign-in, sign-up and password reset asks her to solve an hCaptcha check. Supabase itself verifies the answer for the whole project, so it applies on every address: the live site, the nicoleDev preview and the admin app.

**Web:**
- The sign-in button (**Enter Mila Studio**) stays off until she solves the check.
- The check expires after a while. If the button turns off again, she solves it again.
- After a failed sign-in the check resets, so she must solve it again before retrying.
- A wrong email, password or check says "Email, password, or verification challenge is invalid." It never says which part was wrong, so nobody can use it to find out whether an account exists.

**Mobile:**
- Older app builds could show "Verified" when she simply closed the check, and the sign-in then failed. Fixed in the next app build (**Coming**).

**What to try:**
1. Solve the check again, then sign in straight away.
2. Check the email address for typos.
3. If the check never appears, try another browser or turn off content blockers for the site. (General advice; not specific to Mila's code.)
4. Still failing: she can reset her password (see below).

## Google sign-in

**Web (Live):** "Continue with Google" works from the live site. After Google, she always lands on the dashboard.

**Web (Coming):** she returns to the page she was on when Mila asked her to sign in, or to the dashboard if she opened the sign-in page directly. A member who has not finished onboarding goes to onboarding first.

**Mobile (Live):** Google sign-in works only in the installed Mila app. A developer test app (Expo Go) refuses it on purpose. If Google itself fails, she sees "Google sign-in is unavailable right now. Please retry."

**On a developer's own computer (Live limitation):** the local address is not on Supabase's list of allowed return addresses, so Google sign-in started locally lands on the **live** site. Use email and password for local testing.

## Signing out

**Live:** signing out on the web or in the app signs her out on **every device and browser** at once.

**Coming:** signing out signs her out on **this device only**. Her other devices stay signed in. If she is offline, the web says "You're offline, so we couldn't sign you out yet. Try again once you're back online." instead of pretending.

Deleting her account signs her out everywhere, in both versions, because the account is removed.

## Web: the "Reconnecting" screen (Coming)

When she opens or reloads Mila and her sign-in can't be refreshed, because she is offline or Mila's sign-in service is having trouble, she sees:

- the heading **Reconnecting**;
- "We can't reach MILA right now. You're still signed in, and we'll keep trying.";
- a **Try again** button and a **Sign in again** link.

The page comes back by itself once the connection returns. It can take about 25 seconds to appear, with Mila's loading screen before it.

The same screen appears when she is signed in but her style profile can't be read, for example after a network error just after sign-in. It replaces onboarding, so a finished member is never sent back through onboarding because of a failed read. On the Style Profile page the message shows inside the page instead of the form, so a blank form can never be saved over her profile.

If her sign-in stops refreshing while she is already on a page, the page stays as it is and a small note at the bottom says "Reconnecting. You're still signed in." with a **Try again** button. While the note shows, Mila reads and saves nothing for her, and an action may say "You're reconnecting. Nothing was read or saved; please try again in a moment." The note goes away by itself when the connection returns.

**Live today:** in the same situations she is sent to the sign-in page, or a finished member is sent to onboarding, even though she was never signed out.

**What to tell her:** "You're still signed in. Check your connection and press Try again. If you were saving something, save it again once the note has gone. Nothing already saved is lost."

## Web: coming back to a tab (Coming)

**Live today**, returning to a Mila tab could:
- reload her History and overwrite unsaved Style Profile edits;
- after a failed sign-in refresh, show **0 credits** or an empty profile (which sent finished members to onboarding).

This is the "my credits disappeared" report. Her credits were never actually gone.

**Coming:** returning to a tab changes nothing on the page, and her credits and profile are never read as empty because of a failed refresh.

**What to tell her (live today):** "Your credits are safe. Check your connection, then reload the page and they'll show correctly."

## Mobile: "Still trying to reach Mila" (Coming)

If the app is still not ready **5 seconds** after it opens, because it can't confirm her sign-in or can't load her profile, it shows:

- **Still trying to reach Mila**;
- "Your connection seems slow or offline. Mila opens on its own as soon as it gets through.";
- **Try again**, plus **Sign in again** while the app is still confirming her sign-in. Sign in again opens the sign-in screen and deletes nothing from her phone. When only her profile is missing she is already signed in, so only Try again shows.

The same view appears if her profile does not load within about 5 seconds right after she signs in, or after she opens a sign-in link from an email. "Opening your studio" gives way to it.

A profile that fails to load never sends a finished member back through onboarding. Onboarding opens only when her profile was read and is really unfinished.

**Live today:** a dropped connection at launch could send her straight to the sign-in screen, and a profile that failed to load could send a finished member to onboarding.

**What to tell her:** "You're still signed in. Check your connection and tap Try again. If the app still doesn't open once you're back online, close it and open it again."

## Mobile: hotel and cafe Wi-Fi (Coming)

Some Wi-Fi networks show their own sign-in page before letting traffic through. When the app refreshed her sign-in on such a network, it could receive that page instead of Mila's answer.

- **Live today:** some of those answers deleted her saved session, so she had to sign in again.
- **Coming:** Wi-Fi sign-in pages, rate limits, timeouts and other replies that did not come from Mila's sign-in service, such as a gateway or firewall error, no longer delete her session. A real sign-out from Mila's side (her session was ended on the server) still signs her out.

The app also saves her session in a way that can't be left half-written if the phone dies mid-save (**Coming**).

## Password reset (Live)

**Web:**
1. On the sign-in page, she chooses **Forgot password**, enters her email and solves the hCaptcha check.
2. If the request goes through, she sees "If an account exists for that email, we've sent a link to reset your password." It never confirms whether the account exists. If Mila's email service refuses the request, for example when the hourly email limit below is reached, she sees "Unable to send the reset link right now. Please try again later."
3. The link opens the reset page on the same site she asked from. She sets a new password there.
4. An old link says "Your reset link has expired. Please request a new one."

**Mobile:** Forgot password sends a link that opens the app.

**Email change (Coming):** the confirmation link returns her to Account on the same site she used. Live today it always opens the live site.

> **Important:** As of the 2026-10-06 audit, Mila's sign-in emails were sent by Supabase's built-in mailer. That mailer only delivers to addresses on the project's team, and only 2 messages an hour. Most members would not receive a reset email until a custom email provider is set up (owner action). There is no admin tool to reset an existing member's password. Tell the owner when a member is stuck. See [Known issues and owner actions](/faqs/known-issues-and-owner-actions).

## "I never got a confirmation email" (Live)

As of the 2026-10-06 audit, email sign-ups are confirmed automatically, so no confirmation email is needed. She can sign in straight away.

## nicoleDev preview sign-in links (fixed 2026-10-07)

The nicoleDev preview addresses (https://mila-nicoledev.vercel.app and https://mila-admin-nicoledev.vercel.app) are now on Supabase's list of allowed return addresses. Google sign-in, password reset links and other sign-in links started on a preview now return to that preview.

Before the fix they landed on the live site. Any address not on the list, such as a developer's own computer, still falls back to the live site. See [Environments and releases](/faqs/environments-and-releases).

## Related articles

- [Members and roles](/faqs/members-and-roles)
- [Support inbox](/faqs/support-inbox)
- [Generations and tab switching](/faqs/generations-and-tab-switching)
- [Environments and releases](/faqs/environments-and-releases)
- [Known issues and owner actions](/faqs/known-issues-and-owner-actions)
