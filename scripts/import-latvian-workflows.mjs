// Snapshot the explicitly requested local workflows; no model weights are copied.
import fs from "node:fs";
import path from "node:path";
import { uiToApi } from "../src/lib/workflowAdapter.ts";
const root = process.argv[2] ?? "D:/Src/tts-latvian/comfy_workflows";
const info = await (await fetch("http://127.0.0.1:8188/object_info")).json();
const sources = [
  ["reference-adapter", "Reference voice · Latvian pilot adapter", "01_latvian_reference_audio.json"],
  ["reference-base", "Reference voice · Qwen base", "02_base_reference_comparison.json"],
  ["female-adapter", "Dramatic female · Latvian pilot adapter", "dramatic/female_adapter.json"],
  ["female-base", "Dramatic female · Qwen base", "dramatic/female_base.json"],
  ["male-adapter", "Dramatic male · Latvian pilot adapter", "dramatic/male_adapter.json"],
  ["male-base", "Dramatic male · Qwen base", "dramatic/male_base.json"],
];
fs.mkdirSync("workflows/latvian-tts", { recursive: true });
const presets = sources.map(([id, label, source]) => {
  const original = fs.readFileSync(path.join(root, source), "utf8");
  const ui = JSON.parse(original);
  // The custom seed widget has a frontend-only control-after-generate value,
  // absent from object_info. Remove it from the conversion copy only.
  for (const node of ui.nodes) {
    if (node.type === "LatvianQwenReference" && typeof node.widgets_values[5] === "string")
      node.widgets_values.splice(5, 1);
  }
  const converted = uiToApi(ui, info);
  if (!converted.clean) throw new Error(`${source}: ${JSON.stringify(converted.warnings)}`);
  fs.writeFileSync(`workflows/latvian-tts/${id}.json`, original);
  return { id, label, source, api: converted.api };
});
fs.writeFileSync("src/lib/latvianTtsPresets.json", JSON.stringify(presets, null, 2) + "\n");
console.log(`Imported ${presets.length} exact source workflows and executable graphs`);
