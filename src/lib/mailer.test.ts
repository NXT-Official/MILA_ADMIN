import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_MAIL_FROM, createMailer, isMailConfigured, mailerFrom } from "./mailer";

const MESSAGE = {
  to: "nadia@example.com",
  subject: "Your Mila receipt",
  html: "<p>Paid</p>",
  text: "Paid",
};

function okResponse(body: unknown = { id: "email-1" }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mailerFrom", () => {
  test("defaults to Mila's noreply address and honours an override", () => {
    expect(mailerFrom({})).toBe(DEFAULT_MAIL_FROM);
    expect(mailerFrom({ MAIL_FROM: "   " })).toBe(DEFAULT_MAIL_FROM);
    expect(mailerFrom({ MAIL_FROM: "Mila <hello@mila.app>" })).toBe("Mila <hello@mila.app>");
  });
});

describe("isMailConfigured", () => {
  test("reports whether this deployment can deliver mail", () => {
    expect(isMailConfigured({})).toBe(false);
    expect(isMailConfigured({ RESEND_API_KEY: "   " })).toBe(false);
    expect(isMailConfigured({ RESEND_API_KEY: "re_123" })).toBe(true);
  });
});

describe("createMailer", () => {
  test("a deployment with no key is a dry run, not an error", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => okResponse());
    const log = mock(() => {});
    const mailer = createMailer({ apiKey: null, fetchImpl: fetchImpl as never, log });

    const result = await mailer.send(MESSAGE);

    expect(result.sent).toBe(false);
    expect(result.skipped).toContain("RESEND_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  test("sends through Resend with the configured sender", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => okResponse());
    const mailer = createMailer({
      apiKey: "re_test",
      from: "Mila <noreply@mila.app>",
      fetchImpl: fetchImpl as never,
      log: mock(() => {}),
    });

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ sent: true, id: "email-1" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe("Mila <noreply@mila.app>");
    expect(body.to).toEqual(["nadia@example.com"]);
    expect(body.subject).toBe("Your Mila receipt");
    expect(body.text).toBe("Paid");
  });

  test("attaches files as base64 with a content type", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => okResponse());
    const mailer = createMailer({
      apiKey: "re_test",
      fetchImpl: fetchImpl as never,
      log: mock(() => {}),
    });

    await mailer.send({
      ...MESSAGE,
      attachments: [{ filename: "receipt.pdf", content: new Uint8Array([37, 80, 68, 70]) }],
    });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.attachments).toEqual([
      { filename: "receipt.pdf", content: "JVBERg==", content_type: "application/pdf" },
    ]);
  });

  test("reports the provider's message when Resend refuses the send", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ message: "domain is not verified" }), { status: 422 }),
    );
    const mailer = createMailer({
      apiKey: "re_test",
      fetchImpl: fetchImpl as never,
      log: mock(() => {}),
    });

    expect(await mailer.send(MESSAGE)).toEqual({
      sent: false,
      error: "domain is not verified",
    });
  });

  test("survives a network failure", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => {
      throw new Error("socket hang up");
    });
    const mailer = createMailer({
      apiKey: "re_test",
      fetchImpl: fetchImpl as never,
      log: mock(() => {}),
    });

    expect(await mailer.send(MESSAGE)).toEqual({ sent: false, error: "socket hang up" });
  });
});
