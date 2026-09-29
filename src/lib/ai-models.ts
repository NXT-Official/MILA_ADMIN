import { z } from "zod";

/**
 * The models staff can switch the styling pipeline onto. These are the live
 * ids from OpenRouter's model list and Images API (vendor/model, lower-case
 * vendor), and every choice that carries vision or structured-output support
 * matters: the text model also serves item detection and personal-colour
 * analysis, which both send images and parse JSON.
 *
 * A deployment is not limited to this list — the console accepts a custom id
 * behind the same validation the database CHECK uses, so a newly released
 * model can be put in service the day it ships.
 */
export interface ModelChoice {
  id: string;
  name: string;
  detail: string;
}

/**
 * Same two ids as the `platform_settings` column defaults in MILA's migration
 * (`20260929043000_add_platform_settings.sql`). They are the "shipped" values
 * the console offers a one-click reset to; changing one means changing the
 * other, and the admin README says so.
 */
export const SHIPPED_DEFAULTS = {
  text: "deepseek/deepseek-v4.1-flash",
  image: "meta/muse-image",
} as const;

export const TEXT_MODEL_CHOICES: ModelChoice[] = [
  {
    id: SHIPPED_DEFAULTS.text,
    name: "DeepSeek v4.1 Flash",
    detail: "Current default — cheap, multimodal, structured output",
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    detail: "$4 / $20 per M tokens — strongest styling and image reasoning",
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    detail: "$2 / $10 per M tokens — near-Opus quality, better cost",
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    detail: "$10 / $50 per M tokens — premium tier for brand-voice looks",
  },
  {
    id: "openai/gpt-6-astra-pro",
    name: "GPT-6 Astra Pro",
    detail: "$10 / $50 per M tokens — highest-accuracy GPT tier",
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    detail: "$0.10 / $0.50 per M tokens — cheapest of the GPT-6 family",
  },
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    detail: "$0.75 / $3.75 per M tokens — fast multimodal, strong on colour",
  },
];

export const IMAGE_MODEL_CHOICES: ModelChoice[] = [
  {
    id: SHIPPED_DEFAULTS.image,
    name: "Muse Image",
    detail: "Current default — reasons before it renders, steady garment detail",
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    detail: "Nano Banana Pro — highest fidelity faces and fabric, slowest",
  },
  {
    id: "google/gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    detail: "Nano Banana 2 — near-Pro quality at a fraction of the latency",
  },
  {
    id: "openai/gpt-image-2.5-sunburst",
    name: "GPT Image 2.5 Sunburst",
    detail: "Precision tier — best prompt adherence for tricky edits",
  },
  {
    id: "openai/gpt-image-2.5-flare",
    name: "GPT Image 2.5 Flare",
    detail: "Speed tier — cheapest per render",
  },
  {
    id: "black-forest-labs/flux.2-max",
    name: "FLUX.2 Max",
    detail: "Strong on texture and editorial lighting",
  },
];

/**
 * Mirrors the database CHECK on `platform_settings.ai_*_model` exactly, so a
 * custom id is refused here with a readable message instead of failing at the
 * insert with a constraint error.
 */
export const modelIdSchema = z
  .string()
  .trim()
  .min(3, "Enter a model id like vendor/model.")
  .max(120, "Model ids are at most 120 characters.")
  .regex(
    /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._:%-]+$/,
    "Use the OpenRouter id: lower-case vendor, a slash, then the model — e.g. anthropic/claude-opus-5.5",
  );

export function findModelChoice(
  choices: readonly ModelChoice[],
  id: string,
): ModelChoice | undefined {
  return choices.find((choice) => choice.id === id);
}

export function isCatalogModel(id: string, choices: readonly ModelChoice[]): boolean {
  return choices.some((choice) => choice.id === id);
}
