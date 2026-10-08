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
  await page.goto(`${base}/project/${pid}?desktop=rtx4090&engine=running`, { waitUntil: "networkidle" });
  await page.locator(".ws-lane.aud").first().waitFor();
  await page.evaluate(async (pid) => {
    const { registerAsset } = await import("/src/lib/db/assets.ts");
    for (const kind of ["audio", "video"]) await registerAsset({
      project_id: pid, kind, b2_key: `${location.origin}/demo/${kind === "audio" ? "music.wav" : "b0.webm"}`,
      content_type: kind === "audio" ? "audio/wav" : "video/webm", duration_ms: 2000,
      meta: { original_name: `Drop test ${kind}` },
    });
    window.__ws.getState().set("panel", "library");
    window.__ws.getState().set("panelOpen", true);
  }, pid);
  const count = () => page.evaluate(async () => {
    return window.__tl.getState().clips.length;
  });
  const initial = await count();
  for (const [index, kind, lane] of [[0, "audio", "aud"], [1, "video", "vid"]]) {
    const source = page.locator(".ws-panel [draggable=true]").filter({ hasText: `Drop test ${kind}` });
    await source.waitFor();
    await source.dragTo(page.locator(`.ws-lane.${lane} .ws-track`).first(), { targetPosition: { x: 50, y: 20 } });
    await page.waitForFunction(async (expected) => {
      return window.__tl.getState().clips.length === expected;
    }, initial + index + 1);
  }
  const result = await page.evaluate(async () => {
    const s = window.__tl.getState();
    return s.clips.map((c) => ({ kind: s.assets.get(c.asset_id)?.kind, lane: s.tracks.find((t) => t.id === c.track_id)?.kind, duration: c.duration_ms }));
  });
  assert.ok(result.some((c) => c.kind === "audio" && c.lane === "audio" && c.duration === 2000));
  assert.ok(result.some((c) => c.kind === "video" && c.lane === "video" && c.duration === 2000));
  console.log("Real browser drag gestures: library audio and video inserted on matching timeline tracks. Desktop bridge mocked.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
