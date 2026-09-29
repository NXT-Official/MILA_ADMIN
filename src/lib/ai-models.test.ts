import { expect, test } from "bun:test";
import {
  IMAGE_MODEL_CHOICES,
  SHIPPED_DEFAULTS,
  TEXT_MODEL_CHOICES,
  findModelChoice,
  isCatalogModel,
  modelIdSchema,
} from "./ai-models";

test("every offered model passes the same shape the database enforces", () => {
  for (const choice of [...TEXT_MODEL_CHOICES, ...IMAGE_MODEL_CHOICES]) {
    expect(modelIdSchema.safeParse(choice.id).success).toBe(true);
    expect(choice.name.length).toBeGreaterThan(0);
    expect(choice.detail.length).toBeGreaterThan(0);
  }
});

test("the two shipped defaults are the first choice in each list", () => {
  expect(TEXT_MODEL_CHOICES[0]?.id).toBe(SHIPPED_DEFAULTS.text);
  expect(IMAGE_MODEL_CHOICES[0]?.id).toBe(SHIPPED_DEFAULTS.image);
  // These are the platform_settings column defaults in MILA's migration; a
  // drift here means "restore the shipped models" restores something else.
  expect(SHIPPED_DEFAULTS.text).toBe("deepseek/deepseek-v4.1-flash");
  expect(SHIPPED_DEFAULTS.image).toBe("meta/muse-image");
});

test("choice ids are unique — Select keys would collide otherwise", () => {
  for (const choices of [TEXT_MODEL_CHOICES, IMAGE_MODEL_CHOICES]) {
    const ids = choices.map((choice) => choice.id);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

test("a custom id is accepted only in vendor/model form", () => {
  expect(modelIdSchema.parse("  anthropic/claude-opus-5.5  ")).toBe("anthropic/claude-opus-5.5");
  expect(modelIdSchema.safeParse("anthropic/claude-opus-5.5:free").success).toBe(true);
  expect(modelIdSchema.safeParse("Anthropic/Claude-Opus").success).toBe(false);
  expect(modelIdSchema.safeParse("claude-opus-5.5").success).toBe(false);
  expect(modelIdSchema.safeParse("deepseek/").success).toBe(false);
  expect(modelIdSchema.safeParse("").success).toBe(false);
});

test("catalog lookups tell a curated choice from a hand-typed id", () => {
  expect(isCatalogModel("meta/muse-image", IMAGE_MODEL_CHOICES)).toBe(true);
  expect(isCatalogModel("vendor/brand-new-model", IMAGE_MODEL_CHOICES)).toBe(false);
  expect(findModelChoice(TEXT_MODEL_CHOICES, "openai/gpt-6-luna")?.name).toBe("GPT-6 Luna");
  expect(findModelChoice(TEXT_MODEL_CHOICES, "nope/nope")).toBeUndefined();
});
