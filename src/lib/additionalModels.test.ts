import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FAMILIES, variantFiles } from "./engineCatalog.ts";
import { RECIPES, samplingFor } from "./localGraphs.ts";
import { localModelRows } from "./localModels.ts";
import { buildLatvianTts, LATVIAN_TTS_PRESETS } from "./latvianComfyTts.ts";
import type { EngineStatus } from "./desktop.ts";

test("Qwen separates spoken text, reference transcript and delivery instruction", () => {
  const text = "Latvijas ilgspējīgas attīstības stratēģija nosaka skaidrus mērķus.";
  const instruct = "Speak in a furious, seething, enraged tone. Maintain clear Latvian pronunciation.";
  const graph = buildLatvianTts("female-base", { text, instruct }, "test");
  assert.equal(graph["2"].inputs.text, text);
  assert.equal(graph["2"].inputs.instruct, instruct);
  assert.notEqual(graph["2"].inputs.reference_text, instruct);
  assert.equal(buildLatvianTts("female-base", { text }, "test")["2"].inputs.instruct, undefined);
});

test("all six Latvian workflows preserve their adapter, transcript and numeric token limit", () => {
  for (const preset of LATVIAN_TTS_PRESETS) {
    const ui = JSON.parse(readFileSync(new URL(`../../workflows/latvian-tts/${preset.id}.json`, import.meta.url), "utf8"));
    const source = ui.nodes.find((n: { type: string }) => n.type === "LatvianQwenReference").widgets_values;
    const graph = buildLatvianTts(`local:latvian-tts/${preset.id}`, { text: "Rīga — pārbaude.", seed: 123 }, "qamba/test");
    assert.equal(graph["2"].inputs.adapter, source[3]);
    assert.equal(graph["2"].inputs.reference_text, source[1]);
    assert.equal(graph["2"].inputs.max_new_tokens, source[6]);
    assert.equal(graph["2"].inputs.language, "Auto");
    assert.equal(graph["2"].inputs.text, "Rīga — pārbaude.");
    assert.equal(graph["2"].inputs.seed, 123);
  }
});
test("custom speech references require their exact transcript and do not mutate the preset", () => {
  const before = JSON.stringify(LATVIAN_TTS_PRESETS);
  assert.throws(() => buildLatvianTts("male-base", { text: "Labdien", reference_asset_id: "ref" }, "test"), /transcript/);
  const graph = buildLatvianTts("male-base", { text: "Labdien", reference_asset_id: "ref", reference_text: "Precīzs teksts",
    tts_effects: { time_stretch: 1.2, pitch_semitones: -1 } }, "test", "my-reference.wav");
  assert.equal(graph["1"].inputs.audio, "my-reference.wav");
  assert.equal(graph["4"].inputs.time_stretch, 1.2);
  assert.equal(JSON.stringify(LATVIAN_TTS_PRESETS), before);
});
test("LTX 2.5 is available without the optional MSR LoRA, and uses the actual VAE filename", () => {
  const family = FAMILIES.find((f) => f.id === "ltx25")!;
  const variant = family.variants[0];
  const files = variantFiles(family, variant).filter((f) => !f.modes).map((f) =>
    f.filename === "ltx-2.5-video-vae-conv-bf16.safetensors" ? "ltx-2.5-video-vae-bf16.safetensors" : f.filename);
  const status = { installed: false, models_linked: false, live_comfy: true, files, nodes: [] } as unknown as EngineStatus;
  const row = localModelRows(status).find((r) => r.id === "local:ltx25/ltx25-int8")!;
  assert.equal(row.enabled, true);
  assert.deepEqual(row.modes, ["t2v", "i2v", "flf"]);
  const recipe = RECIPES.ltx25;
  const graph = recipe.build({ family, variant, prompt: "test", negative: "", width: 640, height: 384, seed: 1,
    sampling: samplingFor(recipe, variant.id), frames: 33, prefix: "test", loras: [], have: new Set(files) });
  assert.equal(graph["3"].inputs.vae_name, "ltx-2.5-video-vae-bf16.safetensors");
});
test("a new image model with missing live nodes is visible but cannot queue", () => {
  const family = FAMILIES.find((f) => f.id === "qwen-image21")!;
  const status = { installed: false, models_linked: false, live_comfy: true,
    files: variantFiles(family, family.variants[0]).map((f) => f.filename), nodes: [] } as unknown as EngineStatus;
  const row = localModelRows(status).find((r) => r.family === "qwen-image21")!;
  assert.equal(row.enabled, false);
  assert.match(String(row.capabilities.desktopWhy), /TextEncodeQwenImage21/);
});
