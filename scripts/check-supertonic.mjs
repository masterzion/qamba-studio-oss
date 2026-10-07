import fs from "node:fs";
import { buildSupertonic } from "../src/lib/supertonicTts.ts";
const cache = "C:/Users/master.PROART/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/custom_nodes/ComfyUI-Supertonic3TTS/models/supertonic-3";
for (const name of ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx", "tts.json", "unicode_indexer.json"])
  if (!fs.statSync(`${cache}/onnx/${name}`).size) throw new Error("Incomplete cache; refused generation to prevent downloading");
if (!fs.statSync(`${cache}/voice_styles/F2.json`).size) throw new Error("Missing voice style");
const base = "http://127.0.0.1:8188";
const queue = await (await fetch(`${base}/queue`)).json();
if (queue.queue_running.length || queue.queue_pending.length) throw new Error("ComfyUI busy; no job submitted");
const response = await fetch(`${base}/prompt`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: buildSupertonic({ text: "Labdien! Šis ir balss pārbaudes teikums.", language: "lv", voice: "F2" }, "qamba/check-supertonic-3") }) });
const submitted = await response.json();
if (!response.ok) throw new Error(JSON.stringify(submitted));
console.log(`Submitted ${submitted.prompt_id}`);
const until = Date.now() + 120000;
while (Date.now() < until) {
  const history = await (await fetch(`${base}/history/${submitted.prompt_id}`)).json();
  const result = history[submitted.prompt_id];
  if (result) {
    fs.writeFileSync(".test-output/models/supertonic-history.json", JSON.stringify(result, null, 2));
    if (result.status.status_str === "error") throw new Error(JSON.stringify(result.status.messages));
    for (const output of Object.values(result.outputs).flatMap(o => Object.values(o).flat()).filter(o => o?.filename)) {
      const bytes = await (await fetch(`${base}/view?${new URLSearchParams(output)}`)).arrayBuffer();
      fs.writeFileSync(`.test-output/models/supertonic-3.${output.filename.split(".").pop()}`, new Uint8Array(bytes));
    }
    console.log("Supertonic 3 Latvian generation completed using existing cache");
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
}
throw new Error("Generation still running; prompt ID retained above");
