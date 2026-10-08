import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const base = process.env.BASE ?? "http://localhost:5177";
try {
  await page.goto(`${base}/ui/local?desktop=rtx4090`, { waitUntil: "networkidle" });
  await page.getByTestId("make-local").click();
  await page.waitForFunction(() => Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows") ?? "{}")).length > 0);
  const pid = await page.evaluate(() => {
    localStorage.setItem("qamba.desktop.setup", JSON.stringify({ engine: "local", comfyUrl: "http://127.0.0.1:8188", completedAt: new Date().toISOString() }));
    return Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows")))[0];
  });
  await page.goto(`${base}/project/${pid}?desktop=rtx4090&engine=running&sheets=ready`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator(".gd-text").waitFor();
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const asset = (await supabase.from("assets").select("*").limit(1)).data[0];
    window.expectedStart = asset.id;
    window.__ws.getState().reuseGeneration({ token: crypto.randomUUID(), kind: "video",
      modelId: "h3-local", modelKey: "minimax-h3", mode: "i2v", prompt: "She walks through the street looking for suspicious people.",
      negative: null, width: 832, height: 480, seed: 42, durationMs: 5000,
      loras: [], refs: [], start: asset, end: null, label: "Routing test", lostRefs: 0 });
  });
  await page.locator(".gd-ctl").filter({ hasText: "MiniMax H3 (local)" }).waitFor();
  assert.match(await page.locator(".gd-ctl").filter({ hasText: "MiniMax H3 (local)" }).getAttribute("title"), /your own hardware/);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForFunction(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const jobs = (await supabase.from("jobs").select("*").eq("kind", "clip_gen")).data;
    return jobs?.some((j) => j.model_id === "h3-local");
  });
  const result = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const jobs = (await supabase.from("jobs").select("*").eq("kind", "clip_gen")).data;
    const job = jobs.find((j) => j.model_id === "h3-local");
    return { job, expectedStart: window.expectedStart };
  });
  assert.equal(result.job.lane, "local");
  assert.equal(result.job.payload.model_key, "minimax-h3");
  assert.equal(result.job.payload.mode, "i2v");
  assert.equal(result.job.payload.start_asset_id, result.expectedStart);
  assert.doesNotMatch(await page.locator(".gd-hint").innerText(), /no runner|Could not queue/);
  console.log("Generator UI: MiniMax H3 image-to-video queues locally with the exact model key, prompt and starting image. Native bridge mocked; no inference submitted.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
