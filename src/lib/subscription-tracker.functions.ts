import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin.functions";
import { isPaddleConfigured } from "@/lib/paddle.server";
import {
  buildTrackerRows,
  summarizeTracker,
  type SubscriptionTrackerRow,
  type TrackerLedgerRow,
  type TrackerPaddlePayment,
  type TrackerPlan,
  type TrackerProfile,
  type TrackerSubscription,
} from "@/lib/subscription-tracker";

const SUBSCRIPTION_COLUMNS =
  "id,user_id,plan_id,status,created_at,current_period_end,cancel_at_period_end,paddle_subscription_id";
const PAGE_SIZE = 500;
const EMAIL_PAGES = 5;

export interface SubscriptionTrackerResult {
  rows: SubscriptionTrackerRow[];
  summary: ReturnType<typeof summarizeTracker>;
  paddleConfigured: boolean;
  paddleError: string | null;
  truncated: boolean;
  notes: string[];
}

/**
 * The subscriptions tracker: who is paying, how much, since when, until when,
 * and which PDFs exist for the payment.
 *
 * Members are named, never identified by id — the console exists so staff can
 * see people. Emails live in `auth.users` (PostgREST can't join them), so they
 * are mapped in from the admin API. Paddle is queried live for amounts and
 * invoice numbers; the member app's `purchases` ledger supplies the receipt
 * paths. Neither is required for the screen to work: without Paddle keys the
 * rows still render from the local mirror, with a note saying why amounts are
 * missing.
 */
export const adminListSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionTrackerResult> => {
    await assertPermission(context.supabase, context.userId, "subscriptions.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const {
      data: subscriptions,
      error,
      count,
    } = await supabaseAdmin
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) throw new Error(`Couldn't load subscriptions: ${error.message}`);

    const rows = (subscriptions ?? []) as TrackerSubscription[];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const planIds = [...new Set(rows.map((row) => row.plan_id).filter((id): id is string => !!id))];

    const [profilesRes, plansRes, ledgerRes] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id,full_name,username").in("id", userIds)
        : Promise.resolve({ data: [] }),
      planIds.length
        ? supabaseAdmin.from("subscription_plans").select("id,title").in("id", planIds)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("purchases")
        .select("id,user_id,amount_cents,currency,created_at,metadata")
        .not("metadata->>paddle_transaction_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
    ]);

    // Emails are only in auth.users; walk the admin API until the pages run out.
    const emails = new Map<string, string | null>();
    let emailPage = 1;
    let hasMoreUsers = true;
    while (hasMoreUsers && emailPage <= EMAIL_PAGES) {
      const { data: page, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page: emailPage,
        perPage: 200,
      });
      if (usersError) {
        console.error("[subscriptions] could not read member emails", usersError.message);
        break;
      }
      for (const user of page.users) emails.set(user.id, user.email ?? null);
      hasMoreUsers = page.users.length === 200;
      emailPage += 1;
    }

    const notes: string[] = [];
    let paddleError: string | null = null;
    let payments: TrackerPaddlePayment[] = [];
    let truncated = false;

    if (isPaddleConfigured()) {
      try {
        const { listCompletedTransactions } = await import("@/lib/paddle.server");
        const result = await listCompletedTransactions();
        payments = result.data as TrackerPaddlePayment[];
        truncated = result.truncated;
        if (truncated) {
          notes.push("Showing the newest payments only — older ones aren't included.");
        }
      } catch (cause) {
        const { describePaddleError } = await import("@/lib/paddle.server");
        paddleError = describePaddleError(
          cause,
          "Couldn't reach Paddle, so amounts and invoice numbers are missing.",
        );
      }
    } else {
      paddleError =
        "Paddle isn't configured on this deployment, so live amounts and invoice numbers are unavailable.";
    }

    const trackerRows = buildTrackerRows({
      subscriptions: rows,
      plans: (plansRes.data ?? []) as TrackerPlan[],
      profiles: (profilesRes.data ?? []) as TrackerProfile[],
      emails,
      ledger: (ledgerRes.data ?? []) as TrackerLedgerRow[],
      payments,
    });

    if (count !== null && count > rows.length) {
      truncated = true;
      notes.push(`Showing the ${rows.length} newest of ${count} memberships.`);
    }

    return {
      rows: trackerRows,
      summary: summarizeTracker(trackerRows),
      paddleConfigured: isPaddleConfigured(),
      paddleError,
      truncated,
      notes,
    };
  });

/** A signed link to Paddle's own PDF invoice for one payment. */
export const adminPaddleInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ transaction_id: z.string().min(3).max(120) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertPermission(context.supabase, context.userId, "subscriptions.view");
    const { getTransactionInvoiceUrl, describePaddleError } = await import("@/lib/paddle.server");
    try {
      return { url: await getTransactionInvoiceUrl(data.transaction_id) };
    } catch (cause) {
      throw new Error(describePaddleError(cause, "Couldn't fetch that invoice from Paddle."));
    }
  });

/** A signed link to Mila's own receipt PDF, stored by the member app. */
export const adminMilaReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        // "<user uuid>/<transaction>.pdf" — the member app writes exactly this.
        path: z
          .string()
          .max(200)
          .regex(/^[0-9a-fA-F-]{36}\/[A-Za-z0-9_.-]+\.pdf$/, "That receipt path is not valid."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertPermission(context.supabase, context.userId, "subscriptions.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed?.signedUrl) {
      throw new Error("That receipt isn't in storage yet. It is written when the payment lands.");
    }
    return { url: signed.signedUrl };
  });
