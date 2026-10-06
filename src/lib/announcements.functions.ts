import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission, recordStaffAction } from "@/lib/admin.functions";
import { announcementInputSchema, parseInput } from "@/lib/staff-input";
import { announcementEmail } from "@/lib/announcement-email";
import { isMailConfigured, mailer, mailerFrom } from "@/lib/mailer";

type MilaSupabaseClient = SupabaseClient<Database>;

/** One run emails at most this many members, so a mistake stays bounded. */
export const MAX_ANNOUNCEMENT_RECIPIENTS = 500;
const SEND_CONCURRENCY = 5;
const USER_PAGES = 20;

export interface AnnouncementAudience {
  /** Members with an email address who are not suspended. */
  total: number;
  suspendedSkipped: number;
  mailConfigured: boolean;
  fromAddress: string;
}

interface Recipient {
  id: string;
  email: string;
}

/**
 * Who an update reaches: every member with an email address, minus suspended
 * accounts (they can't sign in, so mailing them is noise). Emails only exist in
 * `auth.users`, so this walks the admin API.
 */
async function loadRecipients(
  supabaseAdmin: MilaSupabaseClient,
): Promise<{ recipients: Recipient[]; suspendedSkipped: number; totalMembers: number }> {
  const users: { id: string; email: string | null }[] = [];
  let page = 1;
  let more = true;
  while (more && page <= USER_PAGES) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Couldn't read the member list: ${error.message}`);
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email ?? null })));
    more = data.users.length === 200;
    page += 1;
  }

  const ids = users.map((user) => user.id);
  const suspended = new Set<string>();
  for (let index = 0; index < ids.length; index += 200) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,suspended")
      .in("id", ids.slice(index, index + 200));
    for (const profile of data ?? []) if (profile.suspended) suspended.add(profile.id);
  }

  const recipients = users
    .filter((user): user is Recipient => Boolean(user.email) && !suspended.has(user.id))
    .map((user) => ({ id: user.id, email: user.email }));

  return { recipients, suspendedSkipped: suspended.size, totalMembers: users.length };
}

/** The audience and whether this deployment can actually deliver mail. */
export const adminAnnouncementAudience = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnouncementAudience> => {
    await assertPermission(context.supabase, context.userId, "announcements.send");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recipients, suspendedSkipped } = await loadRecipients(supabaseAdmin);
    return {
      total: recipients.length,
      suspendedSkipped,
      mailConfigured: isMailConfigured(),
      fromAddress: mailerFrom(),
    };
  });

export interface AnnouncementResult {
  sent: number;
  failed: number;
  skipped: number;
  recipients: number;
  truncated: boolean;
  /** True when nothing left the building because mail isn't configured. */
  dryRun: boolean;
  failures: string[];
}

/**
 * Emails every member about a Mila update. Admin-only, audited, and honest
 * about what happened: a deployment with no `RESEND_API_KEY` reports a dry run
 * instead of claiming it sent anything.
 */
export const adminSendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => parseInput(announcementInputSchema, input))
  .handler(async ({ data, context }): Promise<AnnouncementResult> => {
    await assertPermission(context.supabase, context.userId, "announcements.send");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { recipients, totalMembers } = await loadRecipients(supabaseAdmin);
    const audience = recipients.slice(0, MAX_ANNOUNCEMENT_RECIPIENTS);
    const content = announcementEmail({ subject: data.subject, body: data.body });
    const mail = mailer();

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (let index = 0; index < audience.length; index += SEND_CONCURRENCY) {
      const chunk = audience.slice(index, index + SEND_CONCURRENCY);
      await Promise.all(
        chunk.map(async (recipient) => {
          const result = await mail.send({
            to: recipient.email,
            subject: content.subject,
            html: content.html,
            text: content.text,
          });
          if (result.sent) sent += 1;
          else if (result.skipped) skipped += 1;
          else {
            failed += 1;
            if (failures.length < 5)
              failures.push(`${recipient.email}: ${result.error ?? "failed"}`);
          }
        }),
      );
    }

    await recordStaffAction(context.userId, "announcement.sent", "members", "all", {
      subject: data.subject,
      recipients: audience.length,
      sent,
      failed,
      skipped,
      total_members: totalMembers,
    });

    return {
      sent,
      failed,
      skipped,
      recipients: audience.length,
      truncated: recipients.length > audience.length,
      dryRun: sent === 0 && skipped > 0,
      failures,
    };
  });
