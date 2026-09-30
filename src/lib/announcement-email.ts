/**
 * The Mila update email: one message, written by staff, sent to every member.
 *
 * Staff write plain text — blank lines separate paragraphs — and this turns it
 * into both an HTML and a plain-text body, so the same words arrive whatever
 * the member's mail client does with HTML.
 */
export type AnnouncementEmailInput = {
  subject: string;
  body: string;
  /** Optional first line, e.g. "Hi Nadia —" for a personal greeting. */
  greeting?: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Blank lines separate paragraphs; single newlines stay line breaks. */
export function announcementParagraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function announcementEmail(input: AnnouncementEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const paragraphs = announcementParagraphs(input.body);
  const greeting = input.greeting?.trim() || null;

  const htmlParagraphs = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:32px 24px;background:#faf8f5;font-family:Georgia,'Times New Roman',serif;color:#1c1b19">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e2d9;border-radius:16px;padding:32px">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8279">Mila</div>
      <h1 style="margin:12px 0 20px;font-size:22px;line-height:1.3;font-weight:600">${escapeHtml(input.subject)}</h1>
      ${greeting ? `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(greeting)}</p>` : ""}
      ${htmlParagraphs}
      <hr style="border:none;border-top:1px solid #e8e2d9;margin:28px 0 16px" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8279">
        You're receiving this because you have a Mila account. This is an automated
        message from our noreply address — replies aren't monitored, but the help desk
        in the app reaches a person.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    "MILA",
    "",
    input.subject,
    "",
    greeting ?? null,
    ...paragraphs,
    "",
    "—",
    "You're receiving this because you have a Mila account. This is an automated message from our noreply address; the help desk in the app reaches a person.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject: input.subject, html, text };
}
