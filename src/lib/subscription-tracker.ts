import { isManualSubscription } from "./member-billing";
import type { PaddleTransactionLike } from "./revenue";

/**
 * The shape behind /subscriptions: one row per membership, naming the member
 * and carrying what they paid, when the period runs out, and which two PDFs
 * exist for it (Paddle's invoice, Mila's own receipt).
 *
 * Everything here is pure so the merge rules — which payment belongs to which
 * membership, what a row says when Paddle is unreachable — are testable without
 * a database or a Paddle key.
 */

export interface TrackerSubscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  created_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  paddle_subscription_id: string;
}

export interface TrackerProfile {
  id: string;
  full_name: string | null;
  username: string | null;
}

export interface TrackerPlan {
  id: string;
  title: string;
}

/** A row of the member app's `purchases` ledger, which is where receipts live. */
export interface TrackerLedgerRow {
  id: string;
  user_id: string | null;
  amount_cents: number;
  currency: string;
  created_at: string;
  metadata: unknown;
}

/** The fields of a Paddle transaction the tracker reads. */
export interface TrackerPaddlePayment extends PaddleTransactionLike {
  subscription_id?: string | null;
  invoice_number?: string | null;
  billed_at?: string | null;
  custom_data?: { user_id?: string } | null;
}

export interface TrackerPayment {
  transactionId: string;
  amountCents: number | null;
  currency: string | null;
  paidAt: string | null;
  invoiceNumber: string | null;
  /** Storage path of Mila's own receipt PDF, when one was generated. */
  receiptPath: string | null;
  source: "ledger" | "paddle" | "both";
}

export interface SubscriptionTrackerRow {
  subscriptionId: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  planTitle: string;
  status: string;
  isManual: boolean;
  startedAt: string;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  payment: TrackerPayment | null;
}

export interface TrackerInput {
  subscriptions: readonly TrackerSubscription[];
  plans: readonly TrackerPlan[];
  profiles: readonly TrackerProfile[];
  emails: ReadonlyMap<string, string | null>;
  ledger: readonly TrackerLedgerRow[];
  payments: readonly TrackerPaddlePayment[];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Names in `profiles` can be empty strings, not just null — the live data has
 * both. A blank name must fall through to the next source rather than render as
 * nothing.
 */
function firstNonBlank(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** `metadata` arrives as JSON; read the keys the receipt pipeline writes. */
export function readLedgerMetadata(metadata: unknown): {
  transactionId: string | null;
  subscriptionId: string | null;
  invoiceNumber: string | null;
  billedAt: string | null;
  receiptPath: string | null;
} {
  const record = (metadata ?? {}) as Record<string, unknown>;
  return {
    transactionId: asString(record.paddle_transaction_id),
    subscriptionId: asString(record.paddle_subscription_id),
    invoiceNumber: asString(record.invoice_number),
    billedAt: asString(record.billed_at),
    receiptPath: asString(record.receipt_path),
  };
}

function amountFromTransaction(transaction: PaddleTransactionLike): number | null {
  const totals = transaction.details?.totals;
  const raw = totals?.grand_total ?? totals?.total;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function newerFirst(a: { paidAt: string | null }, b: { paidAt: string | null }): number {
  const left = a.paidAt ?? "";
  const right = b.paidAt ?? "";
  return right.localeCompare(left);
}

/**
 * One payment per Paddle transaction, combining the live Paddle list with the
 * member app's ledger. Paddle carries the invoice number, the ledger carries
 * the receipt path — the same transaction often has both.
 */
function mergePayments(
  ledger: readonly TrackerLedgerRow[],
  payments: readonly TrackerPaddlePayment[],
): Map<string, TrackerPayment> {
  const merged = new Map<string, TrackerPayment>();

  for (const payment of payments) {
    if (!payment.id) continue;
    merged.set(payment.id, {
      transactionId: payment.id,
      amountCents: amountFromTransaction(payment),
      currency: payment.currency_code ? payment.currency_code.toUpperCase() : null,
      paidAt: payment.billed_at ?? payment.created_at ?? null,
      invoiceNumber: payment.invoice_number ?? null,
      receiptPath: null,
      source: "paddle",
    });
  }

  for (const row of ledger) {
    const metadata = readLedgerMetadata(row.metadata);
    const id = metadata.transactionId ?? row.id;
    const existing = merged.get(id);
    merged.set(id, {
      transactionId: id,
      amountCents: existing?.amountCents ?? row.amount_cents,
      currency: existing?.currency ?? row.currency?.toUpperCase() ?? null,
      paidAt: existing?.paidAt ?? metadata.billedAt ?? row.created_at,
      invoiceNumber: existing?.invoiceNumber ?? metadata.invoiceNumber,
      receiptPath: metadata.receiptPath,
      source: existing ? "both" : "ledger",
    });
  }

  return merged;
}

/** The newest payment that belongs to a membership. */
export function paymentForSubscription(
  payments: ReadonlyMap<string, TrackerPayment>,
  transactions: readonly { subscriptionId: string | null; transactionId: string }[],
): TrackerPayment | null {
  const candidates = transactions
    .filter((entry) => entry.subscriptionId)
    .map((entry) => payments.get(entry.transactionId))
    .filter((payment): payment is TrackerPayment => Boolean(payment))
    .sort(newerFirst);
  return candidates[0] ?? null;
}

export function buildTrackerRows(input: TrackerInput): SubscriptionTrackerRow[] {
  const plans = new Map(input.plans.map((plan) => [plan.id, plan.title]));
  const profiles = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const payments = mergePayments(input.ledger, input.payments);

  // Which transaction ids belong to which Paddle subscription, from both sources.
  const bySubscription = new Map<string, { subscriptionId: string; transactionId: string }[]>();
  const add = (subscriptionId: string | null, transactionId: string) => {
    if (!subscriptionId) return;
    const list = bySubscription.get(subscriptionId) ?? [];
    list.push({ subscriptionId, transactionId });
    bySubscription.set(subscriptionId, list);
  };
  for (const payment of input.payments) {
    if (payment.id) add(payment.subscription_id ?? null, payment.id);
  }
  for (const row of input.ledger) {
    const metadata = readLedgerMetadata(row.metadata);
    add(metadata.subscriptionId, metadata.transactionId ?? row.id);
  }

  return input.subscriptions.map((subscription) => {
    const profile = profiles.get(subscription.user_id);
    const isManual = isManualSubscription(subscription.paddle_subscription_id);
    return {
      subscriptionId: subscription.id,
      memberId: subscription.user_id,
      memberName:
        firstNonBlank(
          profile?.full_name,
          profile?.username,
          input.emails.get(subscription.user_id),
        ) ?? "Unnamed member",
      memberEmail: input.emails.get(subscription.user_id) ?? null,
      planTitle:
        (subscription.plan_id ? plans.get(subscription.plan_id) : null) ??
        (isManual ? "Granted plan" : "Unknown plan"),
      status: subscription.status,
      isManual,
      startedAt: subscription.created_at,
      expiresAt: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      payment: isManual
        ? null
        : paymentForSubscription(
            payments,
            bySubscription.get(subscription.paddle_subscription_id) ?? [],
          ),
    };
  });
}

/** Statuses in which a membership is still in force for the member. */
const IN_FORCE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/**
 * A staff-granted plan is "Granted" only while it is in force. Once it is
 * canceled or lapses it is an ended membership like any other, so the row says
 * so instead of still claiming a grant that no longer gives anything.
 */
function isGrantedInForce(row: SubscriptionTrackerRow): boolean {
  return row.isManual && IN_FORCE_STATUSES.has(row.status);
}

export function summarizeTracker(rows: readonly SubscriptionTrackerRow[]) {
  return {
    total: rows.length,
    granted: rows.filter(isGrantedInForce).length,
    withReceipt: rows.filter((row) => row.payment?.receiptPath).length,
    withInvoice: rows.filter((row) => row.payment?.invoiceNumber).length,
    paidWithoutReceipt: rows.filter((row) => row.payment && !row.payment.receiptPath).length,
  };
}

export function formatTrackerAmount(amountCents: number | null, currency: string | null): string {
  if (amountCents === null) return "—";
  const code = (currency ?? "USD").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  const amount = (amountCents / 100).toFixed(2);
  return symbol ? `${symbol}${amount}` : `${amount} ${code}`;
}

/** The same symbols the member app's receipt uses, so both read alike. */
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "30 Sep 2026" — spelled out rather than through `Intl`, whose short month
 * names differ by ICU version (the CI runner writes "Sept"), and always in UTC
 * so one payment shows the same day wherever a steward opens the console.
 */
export function formatTrackerDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
  paused: "Paused",
};

export function trackerStatusLabel(row: SubscriptionTrackerRow): string {
  if (isGrantedInForce(row)) return "Granted";
  const label = STATUS_LABELS[row.status] ?? row.status;
  return row.cancelAtPeriodEnd && row.status === "active" ? `${label} — ends` : label;
}

export type TrackerTone = "live" | "granted" | "ended" | "attention";

export function trackerStatusTone(row: SubscriptionTrackerRow): TrackerTone {
  if (isGrantedInForce(row)) return "granted";
  if (row.status === "active" || row.status === "trialing") {
    return row.cancelAtPeriodEnd ? "ended" : "live";
  }
  if (row.status === "past_due") return "attention";
  return "ended";
}

/** True when the paid period has run out, whatever the status column says. */
export function isExpired(row: SubscriptionRowDates, now: Date = new Date()): boolean {
  if (!row.expiresAt) return false;
  const end = new Date(row.expiresAt);
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
}

interface SubscriptionRowDates {
  expiresAt: string | null;
}
