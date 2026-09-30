import { describe, expect, mock, test } from "bun:test";
import { announcementEmail, announcementParagraphs, escapeHtml } from "./announcement-email";

describe("announcementParagraphs", () => {
  test("blank lines separate paragraphs and single newlines stay inside one", () => {
    expect(announcementParagraphs("First line\nstill first\n\nSecond one")).toEqual([
      "First line\nstill first",
      "Second one",
    ]);
  });

  test("normalises CRLF and drops empty input", () => {
    expect(announcementParagraphs("a\r\n\r\nb")).toEqual(["a", "b"]);
    expect(announcementParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("escapeHtml", () => {
  test("neutralises the characters that would break the template", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quotes'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;",
    );
  });
});

describe("announcementEmail", () => {
  const email = announcementEmail({
    subject: "Three things we shipped",
    body: "Faster looks.\n\nA new membership page.\n\n— The Mila team",
  });

  test("the subject carries through to both bodies", () => {
    expect(email.subject).toBe("Three things we shipped");
    expect(email.html).toContain("Three things we shipped");
    expect(email.text).toContain("Three things we shipped");
  });

  test("every paragraph arrives in the text version, in order", () => {
    const text = email.text;
    expect(text.indexOf("Faster looks.")).toBeLessThan(text.indexOf("A new membership page."));
    expect(text.indexOf("A new membership page.")).toBeLessThan(text.indexOf("— The Mila team"));
    expect(text).toContain("noreply");
  });

  test("html renders paragraphs and escapes anything typed into them", () => {
    expect((email.html.match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(3);

    const risky = announcementEmail({ subject: "Hi", body: "<b>bold</b> & <i>italic</i>" });
    expect(risky.html).not.toContain("<b>bold</b>");
    expect(risky.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    // The plain-text version keeps what was typed.
    expect(risky.text).toContain("<b>bold</b>");
  });

  test("a greeting is optional", () => {
    const withGreeting = announcementEmail({ subject: "Hi", body: "Body", greeting: "Hi Nadia," });
    expect(withGreeting.html).toContain("Hi Nadia,");
    expect(withGreeting.text).toContain("Hi Nadia,");

    expect(email.html).not.toContain("Hi Nadia,");
  });

  test("an empty body still produces a valid message", () => {
    const empty = announcementEmail({ subject: "Only a subject", body: "" });
    expect(empty.html).toContain("Only a subject");
    expect(empty.text).toContain("Only a subject");
  });
});

describe("announcementEmail is what the mailer receives", () => {
  test("the shape matches a MailMessage", () => {
    const send = mock(
      async (_message: { to: string; subject: string; html: string; text: string }) => ({
        sent: true,
      }),
    );
    const content = announcementEmail({ subject: "S", body: "B" });
    void send({ to: "member@example.com", ...content });
    const message = send.mock.calls[0][0];
    expect(Object.keys(message).sort()).toEqual(["html", "subject", "text", "to"]);
  });
});
