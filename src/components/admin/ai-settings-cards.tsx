import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMAGE_MODEL_CHOICES,
  TEXT_MODEL_CHOICES,
  findModelChoice,
  modelIdSchema,
  type ModelChoice,
} from "@/lib/ai-models";
import { adminUpdatePlatformSettings, type AdminAiSettings } from "@/lib/ai-settings.functions";
import {
  TAX_DEDUCTION_KINDS,
  TAX_DEDUCTION_LABELS,
  computeTaxDeductionCents,
  describeTaxSetting,
  taxDeductionKindSchema,
  taxDeductionValueSchema,
  type TaxDeductionKind,
} from "@/lib/revenue";
import { formatAiSpend } from "@/components/admin/stat-cards";
import { errorMessage } from "@/lib/utils";

const CUSTOM = "__custom__";

interface ModelPickerProps {
  id: string;
  label: string;
  hint: string;
  choices: readonly ModelChoice[];
  value: string;
  onChange: (id: string) => void;
}

function ModelPicker({ id, label, hint, choices, value, onChange }: ModelPickerProps) {
  const inCatalog = !!findModelChoice(choices, value);
  const [customOpen, setCustomOpen] = useState(!inCatalog);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-label text-stone">
        {label}
      </Label>
      <Select
        value={customOpen ? CUSTOM : value}
        onValueChange={(next) => {
          if (next === CUSTOM) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(next);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choose a model" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.name} — {choice.id}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom model id…</SelectItem>
        </SelectContent>
      </Select>
      {customOpen ? (
        <Input
          aria-label={`${label} custom id`}
          placeholder="vendor/model"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <p className="text-xs text-stone">
          {findModelChoice(choices, value)?.detail ?? "—"}{" "}
          <span className="opacity-70">{hint}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The switch itself. Whatever is saved here is what the member app reads on
 * its next call — no deploy, no restart — because the member app resolves the
 * model from `platform_settings` per request.
 */
export function ModelSettingsCard({
  settings,
  onSaved,
}: {
  settings: AdminAiSettings;
  onSaved: () => void;
}) {
  const save = useServerFn(adminUpdatePlatformSettings);
  const [textModel, setTextModel] = useState(settings.textModel);
  const [imageModel, setImageModel] = useState(settings.imageModel);
  const [pending, setPending] = useState(false);

  const dirty = textModel !== settings.textModel || imageModel !== settings.imageModel;
  const textInvalid = !modelIdSchema.safeParse(textModel).success;
  const imageInvalid = !modelIdSchema.safeParse(imageModel).success;

  async function submit(next: { text: string; image: string }, message: string) {
    setPending(true);
    try {
      await save({ data: { ai_text_model: next.text, ai_image_model: next.image } });
      toast.success(message);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the models."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Styling models</h2>
        <p className="text-xs text-stone">
          Text &amp; vision handles look composition, item detection and colour analysis; image
          renders the look, style sheet and photo preview. Saved models take effect on the member
          app's next call.
        </p>
      </header>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <ModelPicker
          id="ai-text-model"
          label="Text & vision model"
          hint="needs vision + structured output"
          choices={TEXT_MODEL_CHOICES}
          value={textModel}
          onChange={setTextModel}
        />
        <ModelPicker
          id="ai-image-model"
          label="Image model"
          hint="needs image output"
          choices={IMAGE_MODEL_CHOICES}
          value={imageModel}
          onChange={setImageModel}
        />
      </div>

      {settings.updatedAt && (
        <p className="mt-4 text-micro uppercase tracking-label text-stone">
          Last changed {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-9 text-xs gap-1.5"
          disabled={pending || !dirty || textInvalid || imageInvalid}
          onClick={() => submit({ text: textModel, image: imageModel }, "Styling models updated.")}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save models
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs gap-1.5"
          disabled={
            pending ||
            (textModel === settings.defaults.text && imageModel === settings.defaults.image)
          }
          onClick={() =>
            submit(
              { text: settings.defaults.text, image: settings.defaults.image },
              "Back on the shipped models.",
            )
          }
        >
          <RotateCcw className="size-3.5" />
          Restore the shipped models
        </Button>
        {(textInvalid || imageInvalid) && (
          <span className="text-xs text-destructive">
            Both ids need the OpenRouter form, e.g. anthropic/claude-opus-5.5.
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * Spend per model for the window, plus the per-call figure the business asks
 * for: total AI spend divided by calls logged. Calls whose provider reported
 * no cost are counted as calls but excluded from the divisor, so the number
 * stays an average of calls we could actually price.
 */
export function ModelUsageCard({ settings }: { settings: AdminAiSettings }) {
  return (
    <section className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Cost per call</h2>
        <p className="text-xs text-stone">Last {settings.windowDays} days</p>
      </header>

      <div className="mt-4 flex flex-wrap items-end gap-8">
        <div>
          <div className="text-nano uppercase tracking-label-xwide text-stone">
            Total cost per call
          </div>
          <div className="mt-1 font-serif text-3xl text-ink">
            {settings.costPerCallUsd === null ? "—" : formatAiSpend(settings.costPerCallUsd)}
          </div>
        </div>
        <div>
          <div className="text-nano uppercase tracking-label-xwide text-stone">Total AI spend</div>
          <div className="mt-1 font-serif text-xl text-ink">
            {formatAiSpend(settings.totalAiSpendUsd)}
          </div>
        </div>
        <div>
          <div className="text-nano uppercase tracking-label-xwide text-stone">Calls logged</div>
          <div className="mt-1 font-serif text-xl text-ink">{settings.totalAiCalls}</div>
        </div>
      </div>

      {settings.usage.length === 0 ? (
        <p className="mt-4 text-xs text-stone">No AI calls in this window yet.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-micro uppercase tracking-label text-stone">
              <tr>
                <th className="py-2 pr-4 font-normal">Model</th>
                <th className="py-2 pr-4 font-normal">Calls</th>
                <th className="py-2 pr-4 font-normal">Tokens</th>
                <th className="py-2 pr-4 font-normal">Spend</th>
                <th className="py-2 font-normal">Cost / call</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {settings.usage.map((row) => (
                <tr key={row.model} className="border-t border-porcelain/60">
                  <td className="py-2 pr-4">
                    <span className="font-mono text-micro">{row.model}</span>
                    {row.active && (
                      <Badge className="ml-2 border-accent/40 text-nano uppercase tracking-label">
                        Active
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">{row.calls}</td>
                  <td className="py-2 pr-4">{row.tokens}</td>
                  <td className="py-2 pr-4">{formatAiSpend(row.spendUsd)}</td>
                  <td className="py-2">
                    {row.costPerCallUsd === null ? "—" : formatAiSpend(row.costPerCallUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settings.usageTruncated && (
        <p className="mt-3 text-micro uppercase tracking-label text-stone">
          The spend table holds more rows than one read returns — totals cover the newest calls.
        </p>
      )}
    </section>
  );
}

/**
 * The revenue tax: a percentage of gross or a fixed amount, either way a
 * float. It feeds /analytics (gross − tax = net) and nothing else — it never
 * changes what a member is charged.
 */
export function RevenueTaxCard({
  settings,
  onSaved,
}: {
  settings: AdminAiSettings;
  onSaved: () => void;
}) {
  const save = useServerFn(adminUpdatePlatformSettings);
  const [kind, setKind] = useState<TaxDeductionKind>(settings.taxDeductionKind);
  const [valueInput, setValueInput] = useState(String(settings.taxDeductionValue));
  const [pending, setPending] = useState(false);

  const parsed = taxDeductionValueSchema.safeParse(Number(valueInput));
  const percentTooHigh = kind === "percent" && parsed.success && parsed.data > 100;
  const dirty =
    kind !== settings.taxDeductionKind || Number(valueInput) !== settings.taxDeductionValue;
  const invalid = !parsed.success || percentTooHigh;
  const value = parsed.success ? parsed.data : 0;

  const sampleTax = computeTaxDeductionCents(100_000, kind, value);

  async function submit() {
    setPending(true);
    try {
      await save({ data: { tax_deduction_kind: kind, tax_deduction_value: value } });
      toast.success("Revenue tax updated.");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the tax setting."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Revenue tax</h2>
        <p className="text-xs text-stone">
          Deducted from gross revenue on /analytics to report net. It never changes what a member is
          charged.
        </p>
      </header>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tax-kind" className="text-xs uppercase tracking-label text-stone">
            Deduction type
          </Label>
          <Select
            value={kind}
            onValueChange={(next) => setKind(taxDeductionKindSchema.parse(next))}
          >
            <SelectTrigger id="tax-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_DEDUCTION_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {TAX_DEDUCTION_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax-value" className="text-xs uppercase tracking-label text-stone">
            {kind === "percent" ? "Percentage" : "Fixed amount"}
            {kind === "percent" ? " (%)" : " (in currency units)"}
          </Label>
          <Input
            id="tax-value"
            inputMode="decimal"
            value={valueInput}
            onChange={(event) => setValueInput(event.target.value)}
          />
          {invalid ? (
            <p className="text-xs text-destructive">
              {percentTooHigh
                ? "A percentage above 100% would report negative net revenue."
                : (parsed.error?.issues[0]?.message ?? "Enter a number.")}
            </p>
          ) : (
            <p className="text-xs text-stone">
              Currently: {describeTaxSetting(kind, value)}. On $1,000 gross that deducts{" "}
              {formatAiSpend(sampleTax / 100)}.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 text-xs gap-1.5"
          disabled={pending || !dirty || invalid}
          onClick={submit}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save tax setting
        </Button>
      </div>
    </section>
  );
}
