/**
 * Transactional email from Mila's noreply address, for the staff suite.
 *
 * The member app has its own copy of this (`MILA/src/lib/mailer.server.ts`):
 * the two apps deploy separately and share no code, so the contract is kept
 * identical on purpose — same env names, same dry-run behaviour, same request
 * shape — and both are covered by their own tests.
 */
export type MailAttachment = {
  filename: string;
  content: Uint8Array;
  contentType?: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

export type MailResult = { sent: boolean; id?: string; skipped?: string; error?: string };

export type MailerDeps = {
  apiKey?: string | null;
  from?: string | null;
  fetchImpl?: typeof fetch;
  log?: (message: string, detail?: unknown) => void;
};

export const DEFAULT_MAIL_FROM = "Mila <noreply@mila.app>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function mailerFrom(env: Record<string, string | undefined> = process.env): string {
  const configured = (env.MAIL_FROM ?? "").trim();
  return configured || DEFAULT_MAIL_FROM;
}

/** True when the deployment can actually deliver mail. */
export function isMailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.RESEND_API_KEY ?? "").trim());
}

export function createMailer(deps: MailerDeps = {}) {
  const log = deps.log ?? ((message, detail) => console.warn(message, detail ?? ""));
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async send(message: MailMessage): Promise<MailResult> {
      const apiKey = (deps.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
      const from = (deps.from ?? mailerFrom()).trim();

      if (!apiKey) {
        log("[mailer] RESEND_API_KEY is not set — email not sent", {
          to: message.to,
          subject: message.subject,
        });
        return { sent: false, skipped: "RESEND_API_KEY is not set" };
      }

      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            attachments: message.attachments?.map((attachment) => ({
              filename: attachment.filename,
              content: Buffer.from(attachment.content).toString("base64"),
              content_type: attachment.contentType ?? "application/pdf",
            })),
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          id?: string;
          message?: string;
          name?: string;
        } | null;

        if (!response.ok) {
          const detail = payload?.message ?? payload?.name ?? `HTTP ${response.status}`;
          console.error("[mailer] send failed", { to: message.to, detail });
          return { sent: false, error: detail };
        }

        return { sent: true, id: payload?.id };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[mailer] send threw", { to: message.to, detail });
        return { sent: false, error: detail };
      }
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

/** The deployment's mailer: keys and sender come from the environment. */
export function mailer(): Mailer {
  return createMailer();
}
