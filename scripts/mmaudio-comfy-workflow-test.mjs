import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
try {
  await page.goto(process.env.COMFY_URL ?? "http://127.0.0.1:8188", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.MMAudioVideoToAudio && window.comfyAPI?.app?.app?.graph?._nodes?.length > 0);
  const workflow = JSON.parse(fs.readFileSync("workflows/mmaudio_video_to_audio.json", "utf8"));
  const generated = await page.evaluate(async workflow => {
    const { app } = await import("/scripts/app.js");
    await app.loadGraphData(workflow);
    if (!app.graph._nodes.some(n => n.type === "MMAudioVideoToAudio")) throw new Error("Reference workflow did not load into the frontend graph");
    return await app.graphToPrompt();
  }, workflow);
  const graph = generated.output;
  const audio = Object.values(graph).find(n => n.class_type === "MMAudioVideoToAudio");
  assert.ok(audio);
  assert.equal(audio.inputs.variant, "large_44k_v2");
  assert.equal(audio.inputs.duration, 0);
  assert.equal(audio.inputs.cfg_strength, 4.5);
  assert.equal(audio.inputs.num_steps, 25);
  assert.equal(audio.inputs.seed, 42);
  assert.ok(Array.isArray(audio.inputs.video));
  assert.ok(Object.values(graph).some(n => n.class_type === "SaveAudio"));
  console.log("Real ComfyUI frontend: repaired workflow imports with variant=large_44k_v2, duration=0 (automatic), CFG=4.5, steps=25, seed=42 and linked video/audio sockets. No inference submitted.");
} finally { await browser.close(); }
