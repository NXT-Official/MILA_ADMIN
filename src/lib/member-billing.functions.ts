import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, recordStaffAction } from "@/lib/admin.functions";
import {
  CONSOLE_IN_FORCE_STATUSES,
  MANUAL_PADDLE_CUSTOMER_ID,
  billingActionInputSchema,
  buildCancelBody,
  buildPlanChangeBody,
  describePlanEnd,
  describePlanGrant,
  describeRefundAdjustmentStatus,
  endPlanInputSchema,
  grantCreditsInputSchema,
  hasRefundablePrice,
  isManualSubscription,
  newManualSubscriptionId,
  planGrantInputSchema,
  type PlanAction,
} from "@/lib/member-billing";
import {
  cancelSubscription,
  changeSubscriptionPlan,
  describePaddleError,
  isPaddleConfigured,
  listCompletedSubscriptionTransactions,
  paddleListAll,
  refundTransaction,
  type PaddleRefundAdjustment,
} from "@/lib/paddle.server";
import { effectiveDailyCredits, liveDailyAllowance, utcDay } from "@/lib/credit-balance";
import {
  assertEntitlementSynced,
  describeGrantCreditsError,
  recordGrantAudit,
} from "@/lib/credit-grant";
import { transactionAmountCents } from "@/lib/revenue";

export interface MemberBillingPlanOption {
  id: string;
  slug: string;
  title: string;
  priceAmount: number;
  currency: string;
  billingInterval: string;
  creditsIncluded: number;
  paddlePriceId: string | null;
  isCurrent: boolean;
}

export interface MemberBillingSubscription {
  id: string;
  status: string;
  planId: string;
  planTitle: string;
  paddleSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export interface MemberLatestTransaction {
  id: string;
  status: string;
  amountCents: number | null;
  currency: string;
  createdAt: string | null;
  /** True when Paddle already holds a refund (approved or awaiting approval) for it. */
  refunded: boolean;
  lastRefundStatus: string | null;
}

export interface MemberBillingSummary {
  /** False when the Paddle keys aren't set on this deployment — refunds are then unavailable. */
  paddleConfigured: boolean;
  subscription: MemberBillingSubscription | null;
  /**
   * True when the live subscription is one staff granted by hand (no Paddle
   * billing behind it). The console then offers local plan edits instead of
   * Paddle refund/cancel actions.
   */
  manualPlan: boolean;
  /** What the member can spend today: the live daily allowance plus purchased credits. */
  credits: { aiCredits: number; purchasedCredits: number; total: number };
  plans: MemberBillingPlanOption[];
  latestTransaction: MemberLatestTransaction | null;
  /** Paddle's own note about the last refund on the payment, when there is one. */
  refundNotice: string | null;
}

interface PaddleRefundAdjustmentRecord {
  id: string;
  status: string;
  action?: string;
  transaction_id?: string;
}

/**
 * Everything the billing dialog needs in one read: the live subscription, the
 * switchable plans, the member's credit balance, and — when Paddle is
 * configured — the newest completed payment plus whether it already carries a
 * refund, so staff never fire a second refund at the same transaction.
 */
export const adminGetMemberBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<MemberBillingSummary> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [subRes, entRes, plansRes] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select(
          "id,status,plan_id,paddle_subscription_id,cancel_at_period_end,current_period_end,updated_at",
        )
        .eq("user_id", data.user_id)
        .in("status", [...CONSOLE_IN_FORCE_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("user_entitlements")
        .select("ai_credits,purchased_credits,credits_reset_at")
        .eq("user_id", data.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("subscription_plans")
        .select(
          "id,slug,title,price_amount,currency,billing_interval,credits_included,paddle_price_id,sort_order",
        )
        .is("archived_at", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    const plans = plansRes.data ?? [];
    const planTitles = new Map<string, string>();
    const planCredits = new Map<string, number>();
    const currentSub = subRes.data ?? null;
    const planIds = new Set<string>(plans.map((plan) => plan.id));
    if (currentSub) planIds.add(currentSub.plan_id);

    const missingPlanIds = [...planIds].filter((id) => !plans.some((plan) => plan.id === id));
    if (missingPlanIds.length > 0) {
      const { data: extraPlans } = await supabaseAdmin
        .from("subscription_plans")
        .select("id,title,credits_included")
        .in("id", missingPlanIds);
      for (const plan of extraPlans ?? []) {
        planTitles.set(plan.id, plan.title);
        planCredits.set(plan.id, plan.credits_included);
      }
    }
    for (const plan of plans) {
      planTitles.set(plan.id, plan.title);
      planCredits.set(plan.id, plan.credits_included);
    }

    const subscription: MemberBillingSubscription | null = currentSub
      ? {
          id: currentSub.id,
          status: currentSub.status,
          planId: currentSub.plan_id,
          planTitle: planTitles.get(currentSub.plan_id) ?? "Unknown plan",
          paddleSubscriptionId: currentSub.paddle_subscription_id,
          cancelAtPeriodEnd: currentSub.cancel_at_period_end,
          currentPeriodEnd: currentSub.current_period_end,
          updatedAt: currentSub.updated_at,
        }
      : null;

    const paddleConfigured = isPaddleConfigured();
    let latestTransaction: MemberLatestTransaction | null = null;
    let refundNotice: string | null = null;

    if (paddleConfigured && subscription) {
      try {
        const [newest] = await listCompletedSubscriptionTransactions(
          subscription.paddleSubscriptionId,
          1,
        );
        if (newest?.id) {
          const adjustments = await paddleListAll<PaddleRefundAdjustmentRecord>(
            "/adjustments",
            { transaction_id: newest.id, per_page: 10 },
            1,
          );
          const refunds = adjustments.data.filter((adjustment) => adjustment.action === "refund");
          const live = refunds.find(
            (adjustment) =>
              adjustment.status === "approved" || adjustment.status === "pending_approval",
          );
          latestTransaction = {
            id: newest.id,
            status: newest.status ?? "completed",
            amountCents: transactionAmountCents(newest),
            currency: (newest.currency_code ?? "USD").toUpperCase(),
            createdAt: newest.created_at ?? null,
            refunded: !!live,
            lastRefundStatus: live?.status ?? null,
          };
          if (live) refundNotice = describeRefundAdjustmentStatus(live.status);
        }
      } catch (error) {
        // A Paddle hiccup must not hide the member's plan and credits — the
        // dialog degrades to "no refundable payment shown" with the reason.
        console.error("[member-billing] paddle lookup failed", error);
        refundNotice = describePaddleError(
          error,
          "Couldn't read this member's payments from Paddle.",
        );
      }
    }

    // The member's spendable balance, not the raw columns: a plan member's
    // `ai_credits` can still hold yesterday's leftover until the day resets.
    const entitlement = entRes.data;
    const dailyCredits = entitlement
      ? effectiveDailyCredits({
          aiCredits: entitlement.ai_credits,
          creditsResetAt: entitlement.credits_reset_at,
          planAllowance: liveDailyAllowance(currentSub, planCredits),
          today: utcDay(),
        })
      : 0;
    const purchasedCredits = entitlement?.purchased_credits ?? 0;

    return {
      paddleConfigured,
      subscription,
      manualPlan: isManualSubscription(currentSub?.paddle_subscription_id),
      credits: {
        aiCredits: dailyCredits,
        purchasedCredits,
        total: dailyCredits + purchasedCredits,
      },
      plans: plans.map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        title: plan.title,
        priceAmount: plan.price_amount,
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        creditsIncluded: plan.credits_included,
        paddlePriceId: plan.paddle_price_id,
        isCurrent: plan.id === subscription?.planId,
      })),
      latestTransaction,
      refundNotice,
    };
  });

export interface MemberBillingActionResult {
  ok: true;
  planAction: PlanAction;
  refund: { id: string; status: string; message: string } | null;
  subscriptionStatus: string;
  planTitle: string;
  message: string;
}

export const adminRefundMemberPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => billingActionInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MemberBillingActionResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,status,plan_id,paddle_subscription_id,cancel_at_period_end,current_period_end")
      .eq("user_id", data.user_id)
      .in("status", [...CONSOLE_IN_FORCE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    if (!sub) throw new Error("This member has no live subscription to change.");
    if (isManualSubscription(sub.paddle_subscription_id)) {
      throw new Error(
        "This plan was granted by staff and isn't billed through Paddle, so there is nothing to refund or cancel there. Use the grant form to change or end it.",
      );
    }

    let targetPlan: { id: string; title: string; paddle_price_id: string | null } | null = null;
    if (data.plan_action === "change") {
      const { data: plan, error } = await supabaseAdmin
        .from("subscription_plans")
        .select("id,title,paddle_price_id,archived_at,is_active")
        .eq("id", data.target_plan_id ?? "")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!plan || plan.archived_at) throw new Error("That plan is no longer available.");
      if (plan.id === sub.plan_id) throw new Error("This member is already on that plan.");
      if (!hasRefundablePrice(plan.paddle_price_id)) {
        throw new Error(
          `“${plan.title}” has no Paddle price yet, so it can't be switched onto. Add the Paddle price id on the Plans screen first.`,
        );
      }
      targetPlan = plan;
    }

    let refund: PaddleRefundAdjustment | null = null;

    if (data.refund) {
      if (!isPaddleConfigured()) {
        throw new Error(
          "Paddle isn't configured on this deployment, so a refund can't be issued. Add PADDLE_ENV and the matching Paddle API key to the admin app's environment.",
        );
      }
      const [newest] = await listCompletedSubscriptionTransactions(
        sub.paddle_subscription_id,
        1,
      ).catch((error) => {
        throw new Error(
          describePaddleError(error, "Couldn't read this subscription's payments from Paddle."),
        );
      });
      if (!newest?.id)
        throw new Error("Paddle has no completed payment for this subscription to refund.");

      try {
        refund = await refundTransaction(newest.id, data.reason);
      } catch (error) {
        throw new Error(describePaddleError(error, "Paddle refused the refund."));
      }
      if (refund.status === "rejected") {
        throw new Error(
          `Paddle rejected the refund for the payment on this subscription. ${describeRefundAdjustmentStatus(refund.status)}`,
        );
      }
    }

    let subscriptionStatus = sub.status;
    try {
      if (data.plan_action === "cancel") {
        const canceled = await cancelSubscription(sub.paddle_subscription_id, {
          refunded: data.refund,
        });
        subscriptionStatus = canceled.status || (data.refund ? "canceled" : sub.status);
        const scheduledEffectiveAt = canceled.scheduled_change?.effective_at ?? null;
        await supabaseAdmin
          .from("subscriptions")
          .update(
            data.refund
              ? {
                  status: "canceled",
                  cancel_at_period_end: false,
                  current_period_end: scheduledEffectiveAt ?? sub.current_period_end,
                }
              : {
                  cancel_at_period_end: true,
                  current_period_end: scheduledEffectiveAt ?? sub.current_period_end,
                },
          )
          .eq("id", sub.id);
      } else if (targetPlan) {
        const changed = await changeSubscriptionPlan(
          sub.paddle_subscription_id,
          targetPlan.paddle_price_id ?? "",
        );
        subscriptionStatus = changed.status || "active";
        await supabaseAdmin
          .from("subscriptions")
          .update({ plan_id: targetPlan.id, status: "active", cancel_at_period_end: false })
          .eq("id", sub.id);
      }
    } catch (error) {
      // The refund (if any) has already left for Paddle at this point; say so
      // rather than reporting a clean failure the staff member would retry.
      const prefix = refund
        ? `The refund was submitted to Paddle, but the plan change failed: `
        : "";
      throw new Error(`${prefix}${describePaddleError(error, "Paddle refused the plan change.")}`);
    }

    const message = data.refund
      ? refund?.status === "approved"
        ? "Payment refunded in full and the subscription updated."
        : "Refund submitted to Paddle; the subscription was updated."
      : "Subscription updated.";

    await recordStaffAction(context.userId, "member.billing_updated", "member", data.user_id, {
      plan_action: data.plan_action,
      refunded: data.refund,
      refund_adjustment_id: refund?.id ?? null,
      refund_status: refund?.status ?? null,
      refund_reason: data.refund ? data.reason : null,
      from_plan_id: sub.plan_id,
      to_plan_id: targetPlan?.id ?? null,
      paddle_subscription_id: sub.paddle_subscription_id,
      resulting_status: subscriptionStatus,
    });

    return {
      ok: true,
      planAction: data.plan_action,
      refund: refund
        ? {
            id: refund.id,
            status: refund.status,
            message: describeRefundAdjustmentStatus(refund.status),
          }
        : null,
      subscriptionStatus,
      planTitle: targetPlan?.title ?? "",
      message,
    };
  });

export interface GrantCreditsResult {
  ok: true;
  amount: number;
  /** The member's balance after the grant, as returned by the ledger RPC. */
  totalCredits: number;
  /** Set when the credits landed but the staff audit record didn't — never a reason to retry. */
  warning: string | null;
}

/**
 * Manual styling credits. The grant goes through the member app's own
 * `grant_ai_credits` RPC (the ledger that `consume_ai_credit` draws from), so
 * a hand-added credit behaves exactly like a purchased one — same daily-reset
 * bookkeeping, same balance the member sees.
 */
export const adminGrantStylingCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => grantCreditsInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GrantCreditsResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The allowance the RPC tops up to is the member's plan entitlement —
    // resolved the same way the member app's credits.server.ts resolves it: the
    // newest in-force subscription, and only while its paid period hasn't ended.
    // A failed lookup stops here: guessing 0 would let the RPC wipe today's bucket.
    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_id,status,current_period_end,cancel_at_period_end")
      .eq("user_id", data.user_id)
      .in("status", [...CONSOLE_IN_FORCE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) {
      console.error("[member-billing] subscription lookup failed before a credit grant", subError);
      throw new Error("Couldn't read this member's plan. Nothing was changed — please try again.");
    }

    const creditsByPlan = new Map<string, number>();
    if (sub) {
      const { data: plan, error: planError } = await supabaseAdmin
        .from("subscription_plans")
        .select("credits_included")
        .eq("id", sub.plan_id)
        .maybeSingle();
      if (planError) {
        console.error("[member-billing] plan lookup failed before a credit grant", planError);
        throw new Error(
          "Couldn't read this member's plan. Nothing was changed — please try again.",
        );
      }
      if (plan) creditsByPlan.set(sub.plan_id, plan.credits_included);
    }
    const dailyAllowance = liveDailyAllowance(sub, creditsByPlan);

    const { data: totalCredits, error } = await supabaseAdmin
      .rpc("grant_ai_credits", {
        _user_id: data.user_id,
        _daily_allowance: dailyAllowance,
        _amount: data.amount,
      })
      .single();
    if (error) {
      console.error("[member-billing] grant_ai_credits failed", error);
      throw new Error(describeGrantCreditsError(error.message));
    }

    // The credits are in the member's balance now. A failing audit write must
    // not look like a failed grant, or a retry grants them twice.
    const warning = await recordGrantAudit(
      () =>
        recordStaffAction(context.userId, "member.credits_granted", "member", data.user_id, {
          amount: data.amount,
          note: data.note,
          daily_allowance: dailyAllowance,
          total_credits: totalCredits ?? null,
        }),
      (auditError) =>
        console.error("[member-billing] credits granted but the audit record was not saved", {
          actor: context.userId,
          member: data.user_id,
          amount: data.amount,
          error: auditError,
        }),
    );

    return {
      ok: true,
      amount: data.amount,
      totalCredits: (totalCredits as number | null) ?? 0,
      warning,
    };
  });

export interface MemberPlanGrantResult {
  ok: true;
  planTitle: string;
  creditsIncluded: number;
  /** True when an earlier staff grant was replaced instead of a new row created. */
  replaced: boolean;
  subscriptionId: string;
  message: string;
}

/**
 * Grant a plan by hand to a member who has none — or replace the one staff
 * granted earlier.
 *
 * Paddle bills through checkout, so there is no Paddle subscription to create
 * here: the row is local, with the same shape and statuses the member app
 * already reads, `manual:` ids Paddle can never match, and the plan's daily
 * credits written exactly the way the webhook writes them on a renewal. The
 * member app needs no deploy to see it — it resolves the plan from this row at
 * request time.
 */
export const adminSetMemberPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => planGrantInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MemberPlanGrantResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("That account no longer exists.");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id,title,credits_included,archived_at,is_active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan || plan.archived_at || !plan.is_active)
      throw new Error("That plan is no longer available.");

    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,plan_id,paddle_subscription_id")
      .eq("user_id", data.user_id)
      .in("status", [...CONSOLE_IN_FORCE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);

    // A billed subscription owns the member's plan slot: granting on top would
    // leave two live rows and the member app reads the newest one.
    if (sub && !isManualSubscription(sub.paddle_subscription_id)) {
      throw new Error(
        "This member already has a Paddle subscription. Cancel or switch it from the Paddle actions instead of granting a plan on top.",
      );
    }
    if (sub && sub.plan_id === plan.id) throw new Error("This member is already on that plan.");

    const subscriptionId = sub?.paddle_subscription_id ?? newManualSubscriptionId();
    if (sub) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({ plan_id: plan.id, status: "active", cancel_at_period_end: false })
        .eq("id", sub.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("subscriptions").insert({
        user_id: data.user_id,
        plan_id: plan.id,
        paddle_subscription_id: subscriptionId,
        paddle_customer_id: MANUAL_PADDLE_CUSTOMER_ID,
        status: "active",
        current_period_end: null,
        cancel_at_period_end: false,
      });
      if (error) throw new Error(error.message);
    }

    // The write the Paddle webhook makes on a renewal, so the member sees the
    // plan's daily credits immediately instead of waiting for the next reset.
    const { data: syncedRows, error: entitlementError } = await supabaseAdmin
      .from("user_entitlements")
      .update({ ai_credits: plan.credits_included })
      .eq("user_id", data.user_id)
      .select("user_id");
    if (entitlementError) {
      console.error("[member-billing] plan granted but entitlements not synced", entitlementError);
      throw new Error("The plan was granted, but the member's credit balance didn't update.");
    }
    // A write that matches no row still reports success — check one was touched.
    assertEntitlementSynced(syncedRows);

    await recordStaffAction(
      context.userId,
      sub ? "member.plan_changed" : "member.plan_assigned",
      "member",
      data.user_id,
      {
        plan_id: plan.id,
        plan_title: plan.title,
        credits_included: plan.credits_included,
        source: "manual",
        subscription_id: subscriptionId,
        replaced_plan_id: sub?.plan_id ?? null,
        note: data.note,
      },
    );

    return {
      ok: true,
      planTitle: plan.title,
      creditsIncluded: plan.credits_included,
      replaced: !!sub,
      subscriptionId,
      message: describePlanGrant({
        planTitle: plan.title,
        creditsIncluded: plan.credits_included,
        replaced: !!sub,
      }),
    };
  });

export interface MemberPlanEndResult {
  ok: true;
  planTitle: string;
  message: string;
}

/**
 * End a plan staff granted. There is nothing to tell Paddle: the row stops
 * counting as in force, so the member drops back to the free allowance — the
 * same end state a Paddle cancel reaches, reached locally.
 */
export const adminEndMemberPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => endPlanInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MemberPlanEndResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,plan_id,paddle_subscription_id")
      .eq("user_id", data.user_id)
      .in("status", [...CONSOLE_IN_FORCE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    if (!sub) throw new Error("This member has no live plan to end.");
    if (!isManualSubscription(sub.paddle_subscription_id)) {
      throw new Error(
        "This subscription is billed through Paddle — cancel it from the Paddle actions so the member is handled there too.",
      );
    }

    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("title")
      .eq("id", sub.plan_id)
      .maybeSingle();
    const planTitle = plan?.title ?? "The granted plan";

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false })
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    await recordStaffAction(context.userId, "member.plan_ended", "member", data.user_id, {
      plan_id: sub.plan_id,
      plan_title: plan?.title ?? null,
      subscription_id: sub.paddle_subscription_id,
      source: "manual",
      note: data.note,
    });

    return { ok: true, planTitle, message: describePlanEnd(planTitle) };
  });
