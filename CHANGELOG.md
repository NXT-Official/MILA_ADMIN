# Changelog

## 2026-10-06/07 — Pre-demo fixes (`nicoleDev`, 4 commits on `main` `4e0cdf2`)

### Fixed

- **Analytics:** "MRR (estimate)" was 100× too high (plan prices are stored in cents) and counted staff-granted memberships; it is now dollars per month, yearly plans divided by 12, grants excluded.
- **Subscriptions:** an ended staff grant shows its real status ("Canceled") instead of "Granted", in the badge, the count and the plan column.
- **Moderation:** pressing Cancel on the hide-reason prompt no longer hides the post.
- **Members / Announcements:** validation errors read as one plain sentence instead of a block of JSON; the browser checks the same rules the server does.
- **Members:** suspending asks for confirmation; staff can't suspend, demote or delete their own account (ids compared case-insensitively).
- **Add styling credits:** a grant can't be applied twice when the audit log write fails; an unconfirmed grant says to check the balance before retrying and the list refreshes; balances follow the member app's daily-reset rule; a lapsed plan gives no allowance; database errors read as plain sentences.
- **Grant plan:** the credit update is checked before success is reported.
