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
    localStorage.setItem("qamba.desktop.setup", JSON.stringify({ engine: "local", completedAt: new Date().toISOString() }));
    return Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows")))[0];
  });
  await page.goto(`${base}/project/${pid}?desktop=rtx4090&engine=running&sheets=ready`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const original = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = async (cmd, args) => {
      const result = await original(cmd, args);
      if (cmd === "engine_status") return { ...result, planner: true, ffmpeg: true, mmaudio_variants: window.testMmaudioReady === false ? [] : ["large_44k_v2"], nodes: [...result.nodes, "LoadVideo", "MMAudioVideoToAudio", "SaveAudio"] };
      return result;
    };
    const { refreshLocalEngine } = await import("/src/hooks/useLocalEngine.ts");
    refreshLocalEngine();
    const { supabase } = await import("/src/lib/supabase.ts");
    const source = (await supabase.from("assets").select("*").limit(1)).data[0];
    const video = { ...source, id: crypto.randomUUID(), kind: "video", content_type: "video/mp4", duration_ms: 8000,
      tags: ["library"], meta: { original_name: "MMAudio fixture.mp4" } };
    await supabase.from("assets").insert(video);
    window.expectedVideo = video.id;
  });
  await page.getByTitle("Audio & voice studio", { exact: true }).click();
  await page.getByRole("tab", { name: "Video", exact: true }).click();
  await page.locator(".av-src").click();
  await page.getByText("MMAudio fixture.mp4", { exact: true }).click();
  await page.locator(".av textarea.av-text").fill("Footsteps synchronized with walking");
  assert.equal(await page.getByText("Ignore what it looks like, keep the timing", { exact: true }).count(), 0);
  await page.locator(".av-go").click();
  await page.waitForFunction(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    return (await supabase.from("jobs").select("*")).data.some(j => j.payload?.source_asset_id === window.expectedVideo);
  });
  const job = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    return (await supabase.from("jobs").select("*")).data.find(j => j.payload?.source_asset_id === window.expectedVideo);
  });
  assert.equal(job.kind, "v2a_gen");
  assert.equal(job.lane, "local");
  assert.equal(job.payload.mmaudio_workflow, "MMAudioVideoToAudio");
  assert.equal(job.payload.mmaudio_variant, "large_44k_v2");
  assert.equal(job.payload.duration_ms, 8000);
  await page.evaluate(async () => {
    window.testMmaudioReady = false;
    const { refreshLocalEngine } = await import("/src/hooks/useLocalEngine.ts");
    refreshLocalEngine();
  });
  await page.getByText(/The linked MMAudio pack needs nonempty/).waitFor();
  assert.ok(await page.locator(".av-go").isDisabled());
  console.log("MMAudio UI selects a library video and queues the reference workflow locally with its parameters. Bridge mocked; no inference.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
