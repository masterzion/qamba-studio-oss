import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";

const specs = JSON.parse(fs.readFileSync("src/lib/__fixtures__/comfy_object_info.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const base = process.env.BASE ?? "http://localhost:5177";
try {
  await page.goto(`${base}/ui/local?desktop=rtx4090`, { waitUntil: "networkidle" });
  await page.getByTestId("make-local").click();
  await page.waitForFunction(() => Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows") ?? "{}")).length > 0);
  const pid = await page.evaluate(() => {
    localStorage.setItem("qamba.desktop.setup", JSON.stringify({ engine: "local", completedAt: new Date().toISOString() }));
    return Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows")))[0];
  });
  await page.goto(`${base}/project/${pid}?desktop=rtx4090&engine=running&sheets=ready`, { waitUntil: "networkidle" });
  await page.evaluate(async (specs) => {
    const { FAMILIES, variantFiles } = await import("/src/lib/engineCatalog.ts");
    const files = FAMILIES.filter((f) => f.id === "ltx23").flatMap((f) => [...f.variants.flatMap((v) => variantFiles(f, v)), ...f.addons.flatMap((a) => a.files)]).map((f) => f.filename);
    const original = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = async (cmd, args) => {
      const result = await original(cmd, args);
      if (cmd === "engine_status") {
        window.testStatus = { ...result, files: [...result.files, ...files], nodes: [...result.nodes, ...Object.keys(specs)], live_comfy: true };
        return window.testStatus;
      }
      return result;
    };
    const { refreshLocalEngine } = await import("/src/hooks/useLocalEngine.ts");
    refreshLocalEngine();
  }, specs);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator(".gd-text").waitFor();
  await page.waitForFunction(() => window.testStatus?.files.includes("ltx-2.3-22b-dev-fp8.safetensors"));
  await page.getByRole("button", { name: "video", exact: true }).click();
  await page.locator(".gd-ctl").filter({ hasText: "H3" }).first().click();
  await page.getByText("InfiniteTalk · audio-driven full-body", { exact: true }).waitFor();
  await page.getByText("LTX 2.3 · dev FP8", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const start = (await supabase.from("assets").select("*").limit(1)).data[0];
    const audio = { ...start, id: crypto.randomUUID(), kind: "audio", content_type: "audio/wav", duration_ms: 5000,
      tags: ["library"], meta: { original_name: "Speech UI fixture.wav" } };
    await supabase.from("assets").insert(audio);
    window.expectedAudio = audio.id;
    window.expectedStart = start.id;
    window.__ws.getState().reuseGeneration({ token: crypto.randomUUID(), kind: "video", modelId: "local:ltx23/ltx23-dev", modelKey: null,
      mode: "ia2v", prompt: "A woman speaks to the viewer.", negative: null, width: 832, height: 448, seed: 42,
      durationMs: 5000, loras: [], refs: [], start, end: null, label: "Lip sync UI test", lostRefs: 0 });
  });
  await page.locator(".gd-ctl").filter({ hasText: "image + audio" }).waitFor();
  await page.getByTitle("Choose audio from library", { exact: true }).click();
  await page.getByText("Speech UI fixture.wav", { exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForFunction(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    return (await supabase.from("jobs").select("*")).data.some((j) => j.payload?.audio_asset_id === window.expectedAudio);
  });
  const job = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    return (await supabase.from("jobs").select("*")).data.find((j) => j.payload?.audio_asset_id === window.expectedAudio);
  });
  assert.equal(job.lane, "local");
  assert.equal(job.model_id, "local:ltx23/ltx23-dev");
  assert.equal(job.payload.mode, "ia2v");
  assert.ok(job.payload.start_asset_id);
  await page.locator(".gd-ctl").filter({ hasText: "image + audio" }).click();
  await page.getByText("ID-LoRA · image + reference voice", { exact: true }).click();
  assert.match(await page.locator(".gd-shelfnote").innerText(), /reference voice/i);
  console.log("Lip-sync UI: image + audio picker queues exact local model, both asset IDs and ia2v; ID-LoRA mode is selectable. Bridge mocked; no inference submitted.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
