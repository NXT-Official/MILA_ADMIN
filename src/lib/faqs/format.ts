const UPDATED_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  // The date has no time of day, so read it as UTC or a timezone could move it by a day.
  timeZone: "UTC",
});

/** `2026-10-07` becomes `7 October 2026`. Anything unreadable is returned as it came. */
export function formatUpdated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : UPDATED_FORMAT.format(date);
}
