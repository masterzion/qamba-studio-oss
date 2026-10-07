import fs from "node:fs";
import { FAMILIES, variantInstalled } from "../src/lib/engineCatalog.ts";
import { RECIPES, samplingFor } from "../src/lib/localGraphs.ts";
import { buildLatvianTts } from "../src/lib/latvianComfyTts.ts";
const base = "http://127.0.0.1:8188";
const info = await (await fetch(`${base}/object_info`)).json();
const have = new Set(
  JSON.stringify(info).match(/[A-Za-z0-9._-]+\.(?:safetensors|gguf|ckpt)/g),
);
fs.mkdirSync(".test-output/models", { recursive: true });
const plans = [];
for (const family of FAMILIES)
  for (const variant of family.variants) {
    const recipe = RECIPES[family.id];
    if (!recipe || !variantInstalled(family, variant, have)) continue;
    for (const mode of [
      "default",
      ...recipe.modes.filter((m) => m === "i2v" || m === "flf"),
    ]) {
      const graph = recipe.build({
        family,
        variant,
        prompt: "A red ceramic cup on a wooden table in soft daylight.",
        negative: "",
        width: 512,
        height: 512,
        seed: 123,
        frames: 33,
        seconds: 10,
        lyrics: "[Instrumental]",
        sampling: samplingFor(recipe, variant.id),
        prefix: `qamba/check-${family.id}`,
        loras: [],
        have,
        ...(mode !== "default" ? { startImage: "qamba-schema-start.png" } : {}),
        ...(mode === "flf" ? { endImage: "qamba-schema-end.png" } : {}),
      });
      const errors = [];
      for (const [id, node] of Object.entries(graph)) {
        if (!info[node.class_type]) {
          errors.push(`${id}: missing ${node.class_type}`);
          continue;
        }
        const inputs = {
          ...info[node.class_type].input.required,
          ...info[node.class_type].input.optional,
        };
        for (const [name, value] of Object.entries(node.inputs)) {
          const schema = inputs[name];
          if (!schema) {
            if (!name.startsWith("images."))
              errors.push(`${id}: unknown ${name}`);
            continue;
          }
          const combo = Array.isArray(schema[0])
            ? schema[0]
            : schema[0] === "COMBO"
              ? schema[1]?.options
              : null;
          if (
            combo &&
            typeof value === "string" &&
            !combo.includes(value) &&
            node.class_type !== "LoadImage"
          )
            errors.push(`${id}.${name}: unavailable ${value}`);
        }
        for (const name of Object.keys(
          info[node.class_type].input.required ?? {},
        ))
          if (
            !(name in node.inputs) &&
            !(name === "images" && node.class_type === "TextEncodeQwenImage21")
          )
            errors.push(`${id}: missing required input ${name}`);
      }
      plans.push({
        family: family.id,
        variant: variant.id,
        mode,
        errors,
        graph,
      });
      console.log(
        `${family.name} / ${variant.label} / ${mode}: ${errors.length ? errors.join("; ") : "live schema and loader files OK"}`,
      );
    }
  }
fs.writeFileSync(
  ".test-output/models/preflight.json",
  JSON.stringify(plans, null, 2),
);
if (plans.some((p) => p.errors.length)) process.exitCode = 1;
if (process.argv.includes("--generate") && !process.exitCode) {
  for (const [label, graph] of [
    ["z-image-turbo", plans.find((p) => p.family === "z-image-turbo").graph],
    [
      "latvian-tts",
      buildLatvianTts(
        "reference-base",
        {
          text: "Labdien! Šis ir balss pārbaudes teikums.",
          max_new_tokens: 256,
        },
        "qamba/check-latvian-tts",
      ),
    ],
    [
      "ltx23",
      plans.find((p) => p.family === "ltx23" && p.variant === "ltx23-distilled")
        .graph,
    ],
  ]) {
    const queue = await (await fetch(`${base}/queue`)).json();
    if (queue.queue_running.length || queue.queue_pending.length)
      throw new Error("ComfyUI became busy; no validation render submitted");
    const response = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: graph }),
    });
    const submitted = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(submitted));
    console.log(`${label}: submitted ${submitted.prompt_id}`);
    const until = Date.now() + 20 * 60_000;
    for (;;) {
      const history = await (
        await fetch(`${base}/history/${submitted.prompt_id}`)
      ).json();
      const result = history[submitted.prompt_id];
      if (result?.status?.completed || result?.status?.status_str === "error") {
        fs.writeFileSync(
          `.test-output/models/${label}-history.json`,
          JSON.stringify(result, null, 2),
        );
        if (result.status.status_str === "error")
          throw new Error(
            `${label}: ${JSON.stringify(result.status.messages).slice(-1600)}`,
          );
        for (const output of Object.values(result.outputs)
          .flatMap((o) => Object.values(o).flat())
          .filter((o) => o?.filename)) {
          const bytes = await (
            await fetch(`${base}/view?${new URLSearchParams(output)}`)
          ).arrayBuffer();
          fs.writeFileSync(
            `.test-output/models/${label}.${output.filename.split(".").pop()}`,
            new Uint8Array(bytes),
          );
        }
        console.log(`${label}: generation completed`);
        break;
      }
      if (Date.now() > until)
        throw new Error(
          `${label}: still running after 20 minutes; prompt retained in ComfyUI`,
        );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
