import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, recordStaffAction } from "@/lib/admin.functions";
import { SHIPPED_DEFAULTS, modelIdSchema } from "@/lib/ai-models";
import {
  TAX_DEDUCTION_KINDS,
  taxDeductionKindSchema,
  taxDeductionValueSchema,
} from "@/lib/revenue";
import type { TaxDeductionKind } from "@/lib/revenue";

/** How far back the per-model usage table and cost-per-call read. */
export const AI_USAGE_WINDOW_DAYS = 30;

export interface AdminModelUsageRow {
  model: string;
  calls: number;
  tokens: number;
  spendUsd: number;
  /** Spend divided by calls, or null when no call in the window reported a cost. */
  costPerCallUsd: number | null;
  /** True for the model currently serving text or images. */
  active: boolean;
}

export interface AdminAiSettings {
  textModel: string;
  imageModel: string;
  taxDeductionKind: TaxDeductionKind;
  taxDeductionValue: number;
  updatedAt: string | null;
  defaults: { text: string; image: string };
  usage: AdminModelUsageRow[];
  totalAiCalls: number;
  totalAiSpendUsd: number;
  /** Total AI spend divided by calls logged — the per-call unit cost. */
  costPerCallUsd: number | null;
  /** True when the spend table holds more rows than one read returns. */
  usageTruncated: boolean;
  windowDays: number;
}

function asTaxKind(value: string): TaxDeductionKind {
  return (TAX_DEDUCTION_KINDS as readonly string[]).includes(value)
    ? (value as TaxDeductionKind)
    : "percent";
}

export const adminAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAiSettings> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - AI_USAGE_WINDOW_DAYS * 86_400_000).toISOString();
    const [settingsRes, spendRes] = await Promise.all([
      supabaseAdmin
        .from("platform_settings")
        .select("ai_text_model,ai_image_model,tax_deduction_kind,tax_deduction_value,updated_at")
        .eq("id", true)
        .maybeSingle(),
      supabaseAdmin
        .from("ai_spend_log")
        .select("model,cost_usd,total_tokens", { count: "exact" })
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
    ]);

    if (settingsRes.error) throw new Error(settingsRes.error.message);

    const row = settingsRes.data;
    const textModel = row?.ai_text_model ?? SHIPPED_DEFAULTS.text;
    const imageModel = row?.ai_image_model ?? SHIPPED_DEFAULTS.image;

    const byModel = new Map<
      string,
      { calls: number; tokens: number; spendUsd: number; costedCalls: number }
    >();
    for (const entry of spendRes.data ?? []) {
      const bucket = byModel.get(entry.model) ?? {
        calls: 0,
        tokens: 0,
        spendUsd: 0,
        costedCalls: 0,
      };
      bucket.calls += 1;
      bucket.tokens += entry.total_tokens ?? 0;
      if (typeof entry.cost_usd === "number") {
        bucket.spendUsd += entry.cost_usd;
        bucket.costedCalls += 1;
      }
      byModel.set(entry.model, bucket);
    }

    const usage: AdminModelUsageRow[] = [...byModel.entries()]
      .map(([model, bucket]) => ({
        model,
        calls: bucket.calls,
        tokens: bucket.tokens,
        spendUsd: bucket.spendUsd,
        costPerCallUsd: bucket.costedCalls > 0 ? bucket.spendUsd / bucket.costedCalls : null,
        active: model === textModel || model === imageModel,
      }))
      .sort((a, b) => b.calls - a.calls);

    const totalAiCalls = usage.reduce((sum, entry) => sum + entry.calls, 0);
    const totalAiSpendUsd = usage.reduce((sum, entry) => sum + entry.spendUsd, 0);
    const costedCalls = [...byModel.values()].reduce((sum, bucket) => sum + bucket.costedCalls, 0);

    return {
      textModel,
      imageModel,
      taxDeductionKind: asTaxKind(row?.tax_deduction_kind ?? "percent"),
      taxDeductionValue: row?.tax_deduction_value ?? 0,
      updatedAt: row?.updated_at ?? null,
      defaults: { text: SHIPPED_DEFAULTS.text, image: SHIPPED_DEFAULTS.image },
      usage,
      totalAiCalls,
      totalAiSpendUsd,
      costPerCallUsd: costedCalls > 0 ? totalAiSpendUsd / costedCalls : null,
      usageTruncated: (spendRes.count ?? 0) > (spendRes.data?.length ?? 0),
      windowDays: AI_USAGE_WINDOW_DAYS,
    };
  });

const UpdateAiSettingsInput = z
  .object({
    ai_text_model: modelIdSchema.optional(),
    ai_image_model: modelIdSchema.optional(),
    tax_deduction_kind: taxDeductionKindSchema.optional(),
    tax_deduction_value: taxDeductionValueSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nothing to update.",
  });

export interface UpdateAiSettingsResult {
  ok: true;
  textModel: string;
  imageModel: string;
  taxDeductionKind: TaxDeductionKind;
  taxDeductionValue: number;
}

export const adminUpdatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateAiSettingsInput.parse(input))
  .handler(async ({ data, context }): Promise<UpdateAiSettingsResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: readError } = await supabaseAdmin
      .from("platform_settings")
      .select("ai_text_model,ai_image_model,tax_deduction_kind,tax_deduction_value")
      .eq("id", true)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const nextKind = data.tax_deduction_kind ?? asTaxKind(current?.tax_deduction_kind ?? "percent");
    const nextValue = data.tax_deduction_value ?? current?.tax_deduction_value ?? 0;
    if (nextKind === "percent" && nextValue > 100) {
      throw new Error(
        "A percentage above 100% would report negative net revenue. Use a fixed amount for larger deductions.",
      );
    }

    const patch = {
      ...data,
      updated_by: context.userId,
    };
    // The row is seeded by the migration; upsert keeps a deployment that lost
    // it (or predates the seed) working instead of failing the update.
    const { data: saved, error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ id: true, ...patch }, { onConflict: "id" })
      .select("ai_text_model,ai_image_model,tax_deduction_kind,tax_deduction_value")
      .single();
    if (error) throw new Error(error.message);

    await recordStaffAction(
      context.userId,
      "ai-settings.updated",
      "platform_settings",
      "platform",
      {
        changed_fields: Object.keys(data),
        ai_text_model: { from: current?.ai_text_model ?? null, to: saved.ai_text_model },
        ai_image_model: { from: current?.ai_image_model ?? null, to: saved.ai_image_model },
        tax_deduction_kind: saved.tax_deduction_kind,
        tax_deduction_value: saved.tax_deduction_value,
      },
    );

    return {
      ok: true,
      textModel: saved.ai_text_model,
      imageModel: saved.ai_image_model,
      taxDeductionKind: asTaxKind(saved.tax_deduction_kind),
      taxDeductionValue: saved.tax_deduction_value,
    };
  });
