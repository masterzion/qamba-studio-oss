import assert from "node:assert/strict";
import fs from "node:fs";
import { RECIPES, samplingFor } from "../src/lib/localGraphs.ts";
import { FAMILIES } from "../src/lib/engineCatalog.ts";

const response = await fetch(`${process.env.COMFY_URL ?? "http://127.0.0.1:8188"}/object_info`);
assert.ok(response.ok);
const info = await response.json();
fs.mkdirSync(".test-output/lipsync", { recursive: true });
for (const [familyId, variantId, mode] of [["ltx23", "ltx23-distilled", "ia2v"], ["ltx23", "ltx23-dev", "ia2v"], ["ltx23", "ltx23-dev", "idv"], ["infinitetalk", "single-fp8", "ia2v"]]) {
  const family = FAMILIES.find((f) => f.id === familyId);
  const variant = family.variants.find((v) => v.id === variantId);
  const recipe = RECIPES[familyId];
  const graph = recipe.build({ family, variant, mode, prompt: "[VISUAL]: A woman speaks. [SPEECH]: Hello. [SOUNDS]: Calm voice.", negative: "",
    width: 640, height: 384, seed: 42, frames: familyId === "ltx23" ? 121 : 125,
    startImage: "staged-image.png", inputAudio: "staged-speech.wav", loras: [], prefix: "qamba/schema-test", sampling: samplingFor(recipe, variantId) });
  const missing = [];
  for (const [id, node] of Object.entries(graph)) {
    const spec = info[node.class_type];
    assert.ok(spec, `${node.class_type} is absent from running ComfyUI`);
    const inputs = { ...spec.input?.required, ...spec.input?.optional };
    for (const key of Object.keys(spec.input?.required ?? {})) assert.ok(key in node.inputs, `${id}.${key} missing`);
    for (const [key, value] of Object.entries(node.inputs)) {
      const declared = inputs[key];
      assert.ok(declared, `${node.class_type}.${key} unknown`);
      if (Array.isArray(value) && value.length === 2 && typeof value[1] === "number") {
        const upstream = graph[value[0]];
        assert.ok(upstream, `${id}.${key} points to missing node`);
        const actual = info[upstream.class_type].output[value[1]];
        assert.equal(actual, declared[0], `${node.class_type}.${key} receives wrong wire type`);
      } else {
        const options = Array.isArray(declared[0]) ? declared[0] : declared[0] === "COMBO" ? declared[1]?.options : null;
        if (options && !["LoadImage", "LoadAudio"].includes(node.class_type) && !options.includes(value)) missing.push(`${node.class_type}.${key}: ${value}`);
      }
    }
  }
  if (familyId === "ltx23") assert.deepEqual(missing, [], "Installed LTX mode must name available files and legal options");
  fs.writeFileSync(`.test-output/lipsync/${variantId}-${mode}-api.json`, JSON.stringify(graph, null, 2));
  console.log(`${variantId}/${mode}: live node inputs and wire types valid${missing.length ? `; ${missing.length} unavailable InfiniteTalk file selections` : "; installed model selections valid"}`);
}
console.log("No prompt queued and no model downloaded. This validates graph compatibility, not inference quality.");
