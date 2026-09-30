import { describe, expect, test } from "bun:test";
import {
  buildTrackerRows,
  formatTrackerAmount,
  formatTrackerDate,
  isExpired,
  readLedgerMetadata,
  summarizeTracker,
  trackerStatusLabel,
  trackerStatusTone,
  type TrackerInput,
  type TrackerSubscription,
} from "./subscription-tracker";

const SUBSCRIPTION: TrackerSubscription = {
  id: "sub-row-1",
  user_id: "user-1",
  plan_id: "plan-1",
  status: "active",
  created_at: "2026-09-01T10:00:00.000Z",
  current_period_end: "2026-10-01T10:00:00.000Z",
  cancel_at_period_end: false,
  paddle_subscription_id: "sub_01kztk3s79phsrq1e8b76w8a0e",
};

function input(overrides: Partial<TrackerInput> = {}): TrackerInput {
  return {
    subscriptions: [SUBSCRIPTION],
    plans: [{ id: "plan-1", title: "Style Pro" }],
    profiles: [{ id: "user-1", full_name: "Nadia Haddad", username: "nadia" }],
    emails: new Map([["user-1", "nadia@example.com"]]),
    ledger: [],
    payments: [],
    ...overrides,
  };
}

describe("readLedgerMetadata", () => {
  test("reads the keys the receipt pipeline writes", () => {
    expect(
      readLedgerMetadata({
        paddle_transaction_id: "txn_1",
        paddle_subscription_id: "sub_1",
        invoice_number: "325-10650",
        billed_at: "2026-09-30T09:15:00.000Z",
        receipt_path: "user-1/txn_1.pdf",
      }),
    ).toEqual({
      transactionId: "txn_1",
      subscriptionId: "sub_1",
      invoiceNumber: "325-10650",
      billedAt: "2026-09-30T09:15:00.000Z",
      receiptPath: "user-1/txn_1.pdf",
    });
  });

  test("survives metadata that is missing, null, or the wrong shape", () => {
    for (const value of [null, undefined, {}, { paddle_transaction_id: 7 }, "nope"]) {
      const metadata = readLedgerMetadata(value);
      expect(metadata.transactionId).toBeNull();
      expect(metadata.receiptPath).toBeNull();
    }
  });
});

describe("buildTrackerRows", () => {
  test("names the member instead of showing an id", () => {
    const [row] = buildTrackerRows(input());
    expect(row.memberName).toBe("Nadia Haddad");
    expect(row.memberEmail).toBe("nadia@example.com");
    expect(row.planTitle).toBe("Style Pro");
    expect(row.startedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(row.expiresAt).toBe("2026-10-01T10:00:00.000Z");
    // The row keeps the id for linking, but nothing staff reads is an id.
    expect(`${row.memberName} ${row.memberEmail} ${row.planTitle}`).not.toContain("user-1");
  });

  test("falls back to the username, then to a label, never to an id", () => {
    const [usernameRow] = buildTrackerRows(
      input({ profiles: [{ id: "user-1", full_name: null, username: "nadia" }] }),
    );
    expect(usernameRow.memberName).toBe("nadia");

    const [unnamedRow] = buildTrackerRows(input({ profiles: [], emails: new Map() }));
    expect(unnamedRow.memberName).toBe("Unnamed member");
    expect(unnamedRow.memberEmail).toBeNull();
  });

  test("an empty profile name falls through instead of rendering as nothing", () => {
    // Live production has both nulls and empty strings in `profiles`.
    const [blankName] = buildTrackerRows(
      input({ profiles: [{ id: "user-1", full_name: "", username: "nadia" }] }),
    );
    expect(blankName.memberName).toBe("nadia");

    // Two real members have no name at all; the email identifies them instead.
    const [bothBlank] = buildTrackerRows(
      input({ profiles: [{ id: "user-1", full_name: "   ", username: "" }] }),
    );
    expect(bothBlank.memberName).toBe("nadia@example.com");

    const [nothingAtAll] = buildTrackerRows(input({ profiles: [], emails: new Map() }));
    expect(nothingAtAll.memberName).toBe("Unnamed member");
  });

  test("takes the amount and invoice number from Paddle, and the receipt from the ledger", () => {
    const [row] = buildTrackerRows(
      input({
        payments: [
          {
            id: "txn_1",
            status: "completed",
            currency_code: "USD",
            billed_at: "2026-09-30T09:15:00.000Z",
            subscription_id: SUBSCRIPTION.paddle_subscription_id,
            invoice_number: "325-10650",
            details: { totals: { grand_total: "4999" } },
          },
        ],
        ledger: [
          {
            id: "purchase-1",
            user_id: "user-1",
            amount_cents: 4999,
            currency: "USD",
            created_at: "2026-09-30T09:15:05.000Z",
            metadata: {
              paddle_transaction_id: "txn_1",
              paddle_subscription_id: SUBSCRIPTION.paddle_subscription_id,
              invoice_number: "325-10650",
              billed_at: "2026-09-30T09:15:00.000Z",
              receipt_path: "user-1/txn_1.pdf",
            },
          },
        ],
      }),
    );

    expect(row.payment).toEqual({
      transactionId: "txn_1",
      amountCents: 4999,
      currency: "USD",
      paidAt: "2026-09-30T09:15:00.000Z",
      invoiceNumber: "325-10650",
      receiptPath: "user-1/txn_1.pdf",
      source: "both",
    });
  });

  test("uses the ledger alone when Paddle is unreachable, keeping the receipt", () => {
    const [row] = buildTrackerRows(
      input({
        ledger: [
          {
            id: "purchase-1",
            user_id: "user-1",
            amount_cents: 1900,
            currency: "usd",
            created_at: "2026-09-12T08:00:00.000Z",
            metadata: {
              paddle_transaction_id: "txn_9",
              paddle_subscription_id: SUBSCRIPTION.paddle_subscription_id,
              receipt_path: "user-1/txn_9.pdf",
            },
          },
        ],
      }),
    );

    expect(row.payment).toMatchObject({
      amountCents: 1900,
      currency: "USD",
      paidAt: "2026-09-12T08:00:00.000Z",
      receiptPath: "user-1/txn_9.pdf",
      source: "ledger",
    });
  });

  test("shows the newest payment when a membership has been billed more than once", () => {
    const [row] = buildTrackerRows(
      input({
        ledger: [
          {
            id: "purchase-old",
            user_id: "user-1",
            amount_cents: 1900,
            currency: "USD",
            created_at: "2026-09-01T10:00:00.000Z",
            metadata: {
              paddle_transaction_id: "txn_old",
              paddle_subscription_id: SUBSCRIPTION.paddle_subscription_id,
              billed_at: "2026-09-01T10:00:00.000Z",
              receipt_path: "user-1/txn_old.pdf",
            },
          },
          {
            id: "purchase-new",
            user_id: "user-1",
            amount_cents: 1900,
            currency: "USD",
            created_at: "2026-09-30T10:00:00.000Z",
            metadata: {
              paddle_transaction_id: "txn_new",
              paddle_subscription_id: SUBSCRIPTION.paddle_subscription_id,
              billed_at: "2026-09-30T10:00:00.000Z",
              receipt_path: "user-1/txn_new.pdf",
            },
          },
        ],
      }),
    );

    expect(row.payment?.transactionId).toBe("txn_new");
    expect(row.payment?.receiptPath).toBe("user-1/txn_new.pdf");
  });

  test("a payment from another membership never leaks into this row", () => {
    const [row] = buildTrackerRows(
      input({
        payments: [
          {
            id: "txn_other",
            status: "completed",
            subscription_id: "sub_someone_else",
            details: { totals: { grand_total: "9900" } },
          },
        ],
      }),
    );
    expect(row.payment).toBeNull();
  });

  test("a granted plan shows as granted, with no Paddle payment attached", () => {
    const [row] = buildTrackerRows(
      input({
        subscriptions: [
          {
            ...SUBSCRIPTION,
            plan_id: null,
            paddle_subscription_id: "manual_comp_b0f0a34a-a32c-4b3c-95d5-5c6a81fe39ea",
          },
        ],
        payments: [
          {
            id: "txn_1",
            status: "completed",
            subscription_id: "manual_comp_b0f0a34a-a32c-4b3c-95d5-5c6a81fe39ea",
            details: { totals: { grand_total: "4999" } },
          },
        ],
      }),
    );

    expect(row.isManual).toBe(true);
    expect(row.planTitle).toBe("Granted plan");
    expect(row.payment).toBeNull();
    expect(trackerStatusLabel(row)).toBe("Granted");
    expect(trackerStatusTone(row)).toBe("granted");
  });

  test("an unknown plan id is named as unknown rather than shown as a uuid", () => {
    const [row] = buildTrackerRows(input({ plans: [] }));
    expect(row.planTitle).toBe("Unknown plan");
  });
});

describe("tracker formatting", () => {
  test("money reads in the member's currency", () => {
    expect(formatTrackerAmount(4999, "USD")).toBe("$49.99");
    expect(formatTrackerAmount(1900, null)).toBe("$19.00");
    expect(formatTrackerAmount(4999, "SEK")).toContain("49.99");
    expect(formatTrackerAmount(null, "USD")).toBe("—");
  });

  test("dates are short and stable, and an absent date is a dash", () => {
    expect(formatTrackerDate("2026-09-30T09:15:00.000Z")).toBe("30 Sep 2026");
    // Pinned: the CI runner's ICU renders en-GB September as "Sept", which is
    // why this is formatted by hand instead of through Intl.
    expect(formatTrackerDate("2026-09-01T00:00:00.000Z")).toBe("01 Sep 2026");
    expect(formatTrackerDate(null)).toBe("—");
    expect(formatTrackerDate("not a date")).toBe("—");
  });

  test("status labels say when a membership is ending", () => {
    const [row] = buildTrackerRows(input());
    expect(trackerStatusLabel(row)).toBe("Active");
    expect(trackerStatusTone(row)).toBe("live");

    const [ending] = buildTrackerRows(
      input({ subscriptions: [{ ...SUBSCRIPTION, cancel_at_period_end: true }] }),
    );
    expect(trackerStatusLabel(ending)).toBe("Active — ends");
    expect(trackerStatusTone(ending)).toBe("ended");

    const [late] = buildTrackerRows(
      input({ subscriptions: [{ ...SUBSCRIPTION, status: "past_due" }] }),
    );
    expect(trackerStatusTone(late)).toBe("attention");
  });

  test("an expired period is visible even while the status still reads active", () => {
    const row = { expiresAt: "2026-09-12T10:00:00.000Z" };
    expect(isExpired(row, new Date("2026-09-30T00:00:00Z"))).toBe(true);
    expect(isExpired(row, new Date("2026-09-01T00:00:00Z"))).toBe(false);
    expect(isExpired({ expiresAt: null })).toBe(false);
  });

  test("the summary counts what staff actually look for", () => {
    const rows = buildTrackerRows(
      input({
        subscriptions: [
          SUBSCRIPTION,
          { ...SUBSCRIPTION, id: "sub-row-2", paddle_subscription_id: "manual:abc" },
        ],
        ledger: [
          {
            id: "purchase-1",
            user_id: "user-1",
            amount_cents: 4999,
            currency: "USD",
            created_at: "2026-09-30T09:15:05.000Z",
            metadata: {
              paddle_transaction_id: "txn_1",
              paddle_subscription_id: SUBSCRIPTION.paddle_subscription_id,
              receipt_path: "user-1/txn_1.pdf",
            },
          },
        ],
      }),
    );
    expect(summarizeTracker(rows)).toEqual({
      total: 2,
      granted: 1,
      withReceipt: 1,
      withInvoice: 0,
      paidWithoutReceipt: 0,
    });
  });
});
