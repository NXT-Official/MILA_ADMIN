import type { PaddleTransactionLike } from "./revenue";

/**
 * Paddle is the system of record for money: this console refunds and changes
 * plans by calling Paddle directly, then mirrors the result into the local
 * `subscriptions` row so the member app agrees immediately instead of waiting
 * for the next webhook. Keys come from the deployment's environment — the same
 * names the member app uses (`PADDLE_ENV`, `PADDLE_API_KEY`,
 * `PADDLE_SANDBOX_API_KEY`) so one set of secrets serves both apps.
 *
 * Missing keys are *not* an error here: the analytics screen reports amounts
 * as unavailable and the billing dialog explains that refunds need the keys,
 * rather than throwing a 500 at a staff member who cannot fix it.
 */
export interface PaddleEnvironment {
  environment: "sandbox" | "production";
  baseUrl: string;
  apiKey: string | null;
}

export function getPaddleEnvironment(
  env: Record<string, string | undefined> = process.env,
): PaddleEnvironment {
  const environment =
    (env.PADDLE_ENV ?? "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox";
  const apiKey =
    environment === "production"
      ? (env.PADDLE_API_KEY ?? "").trim()
      : (env.PADDLE_SANDBOX_API_KEY ?? "").trim();
  return {
    environment,
    baseUrl:
      environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com",
    apiKey: apiKey || null,
  };
}

export function isPaddleConfigured(env?: Record<string, string | undefined>): boolean {
  return getPaddleEnvironment(env).apiKey !== null;
}

export class PaddleRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "PaddleRequestError";
    this.status = status;
  }
}

interface PaddleListResponse<T> {
  data: T[];
  meta?: { pagination?: { next?: string | null; has_more?: boolean; estimated_total?: number } };
}

export type PaddleQuery = Record<string, string | number | undefined>;

function buildUrl(base: string, path: string, query?: PaddleQuery): string {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function requireApiKey(): PaddleEnvironment {
  const env = getPaddleEnvironment();
  if (!env.apiKey) {
    throw new PaddleRequestError(
      "Paddle isn't configured on this deployment. Add PADDLE_ENV and the matching Paddle API key to the admin app's environment (see .env.example).",
    );
  }
  return env;
}

async function requestJson<T>(
  env: PaddleEnvironment,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.apiKey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (cause) {
    console.error("[paddle] request failed", cause);
    throw new PaddleRequestError(
      `Couldn't reach Paddle (${env.environment}). Check this deployment's network access and retry.`,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new PaddleRequestError(paddleFailureMessage(response.status, payload), response.status);
  }
  return payload as T;
}

/** Paddle errors carry `error.detail` / `error.errors[]`; surface the detail. */
function paddleFailureMessage(status: number, payload: unknown): string {
  const error = (payload as { error?: { detail?: string; code?: string } } | null)?.error;
  const detail = error?.detail ?? error?.code;
  const suffix = detail ? ` — ${detail}` : "";
  if (status === 401) return `Paddle rejected the API key (401)${suffix}`;
  if (status === 403)
    return `Paddle refused this request (403). The key may belong to the other environment${suffix}`;
  if (status === 404) return `Paddle couldn't find that record (404)${suffix}`;
  if (status === 409) return `Paddle refused this change (409)${suffix}`;
  if (status === 429) return `Paddle is rate-limiting us (429). Try again in a moment${suffix}`;
  return `Paddle request failed (${status})${suffix}`;
}

export async function paddleRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown; query?: PaddleQuery },
): Promise<T> {
  const env = requireApiKey();
  return requestJson<T>(env, buildUrl(env.baseUrl, path, init?.query), init);
}

/**
 * Follows Paddle's `meta.pagination.next` until the pages run out or `maxPages`
 * is hit — the caller gets `truncated` so a screen can say "at least" instead
 * of silently under-reporting.
 */
export async function paddleListAll<T>(
  path: string,
  query?: PaddleQuery,
  maxPages = 5,
): Promise<{ data: T[]; truncated: boolean; estimatedTotal: number | null }> {
  const env = requireApiKey();
  const data: T[] = [];
  let url: string | null = buildUrl(env.baseUrl, path, query);
  let pages = 0;
  let truncated = false;
  let estimatedTotal: number | null = null;

  while (url) {
    const page: PaddleListResponse<T> = await requestJson<PaddleListResponse<T>>(env, url);
    data.push(...(page.data ?? []));
    estimatedTotal = page.meta?.pagination?.estimated_total ?? estimatedTotal;
    pages += 1;
    const next = page.meta?.pagination?.next ?? null;
    if (next && pages >= maxPages) {
      truncated = true;
      url = null;
    } else {
      url = next;
    }
  }

  return { data, truncated, estimatedTotal };
}

/** Newest completed transactions for a subscription — the refundable payment. */
export async function listCompletedSubscriptionTransactions(
  subscriptionId: string,
  perPage = 10,
): Promise<PaddleTransactionLike[]> {
  const { data } = await paddleListAll<PaddleTransactionLike>(
    "/transactions",
    {
      subscription_id: subscriptionId,
      status: "completed",
      order_by: "created_at[DESC]",
      per_page: perPage,
    },
    1,
  );
  return data;
}

export interface PaddleTransactionSummary extends PaddleTransactionLike {
  subscription_id?: string | null;
  customer_id?: string | null;
  invoice_number?: string | null;
  billed_at?: string | null;
  custom_data?: { user_id?: string } | null;
  items?: { price?: { description?: string | null } | null }[] | null;
}

/**
 * Completed payments across the whole account, newest first — what the
 * subscriptions tracker shows as "paid". `maxPages` bounds the call: the
 * tracker reports `truncated` rather than pretending it saw everything.
 */
export async function listCompletedTransactions(
  perPage = 30,
  maxPages = 4,
): Promise<{ data: PaddleTransactionSummary[]; truncated: boolean }> {
  const { data, truncated } = await paddleListAll<PaddleTransactionSummary>(
    "/transactions",
    { status: "completed", order_by: "created_at[DESC]", per_page: perPage },
    maxPages,
  );
  return { data, truncated };
}

/**
 * Paddle's own PDF invoice for a transaction, as a short-lived download link
 * (the URL is signed and expires). Staff open it directly from the tracker.
 */
export async function getTransactionInvoiceUrl(transactionId: string): Promise<string> {
  const result = await paddleRequest<{ data?: { url?: string } }>(
    `/transactions/${encodeURIComponent(transactionId)}/invoice`,
  );
  const url = result.data?.url;
  if (!url) throw new PaddleRequestError("Paddle returned no invoice link for that payment.");
  return url;
}

export interface PaddleRefundAdjustment {
  id: string;
  status: string;
  action?: string;
  type?: string;
}

/**
 * Refunds the payment behind a subscription in full. Paddle holds the money
 * for a while after the refund is approved, so the caller reports the
 * adjustment's own status rather than claiming the member has been paid.
 */
export async function refundTransaction(
  transactionId: string,
  reason: string,
): Promise<PaddleRefundAdjustment> {
  const result = await paddleRequest<{ data: PaddleRefundAdjustment }>("/adjustments", {
    method: "POST",
    body: { action: "refund", type: "full", transaction_id: transactionId, reason },
  });
  return result.data;
}

export interface PaddleSubscriptionSummary {
  id: string;
  status: string;
  next_billed_at?: string | null;
  scheduled_change?: { action?: string; effective_at?: string | null } | null;
  items?: { price?: { id?: string } | null }[];
}

/**
 * `effective_from: "immediately"` is only used when the payment is being
 * refunded — refunding and then serving the rest of the period would hand the
 * member a free month. A cancel without a refund ends at the period boundary,
 * which is what the member keeps paying for.
 */
export async function cancelSubscription(
  subscriptionId: string,
  options: { refunded: boolean },
): Promise<PaddleSubscriptionSummary> {
  const result = await paddleRequest<{ data: PaddleSubscriptionSummary }>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      body: { effective_from: options.refunded ? "immediately" : "next_billing_period" },
    },
  );
  return result.data;
}

/**
 * Switches the subscription to another plan's Paddle price. The Paddle price
 * ids live on the plan catalog, so a plan with no `paddle_price_id` cannot be
 * switched onto — the caller refuses that before calling here.
 *
 * `do_not_bill` proration: the member is neither charged for the upgrade nor
 * credited for unused time. Staff are changing a plan on a member's behalf
 * (usually as a fix), and silently charging a card is not a decision this
 * console makes. The member app's own checkout stays the billing path.
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  priceId: string,
): Promise<PaddleSubscriptionSummary> {
  const result = await paddleRequest<{ data: PaddleSubscriptionSummary }>(
    `/subscriptions/${subscriptionId}`,
    {
      method: "PATCH",
      body: {
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: "do_not_bill",
      },
    },
  );
  return result.data;
}

export function describePaddleError(error: unknown, fallback: string): string {
  if (error instanceof PaddleRequestError) return error.message;
  return fallback;
}
