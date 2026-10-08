/**
 * The staff screen a path belongs to: `/faqs/credits-and-refunds` is part of `/faqs`.
 * The sidebar uses it to keep the right link lit and the header to keep the right
 * title while a screen has pages of its own.
 */
export function staffSectionOf(path: string): string {
  const first = path.split("/").find((segment) => segment !== "");
  return first === undefined ? "/" : `/${first}`;
}
