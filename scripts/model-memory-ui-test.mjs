import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
const log = fs.readFileSync(".hardware-memory-final-tests.log", "utf8");
const profile = JSON.parse(log.match(/\{\s*"os":[\s\S]*?\n\}/)?.[0] ?? "null");
assert.ok(profile?.gpus.length, "Run native hardware tests first to capture this machine's actual profile");
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
  await page.goto(`${base}/project/${pid}/bible?desktop=rtx4090&engine=running`, { waitUntil: "networkidle" });
  await page.evaluate((profile) => {
    const original = window.__TAURI__.core.invoke;
    window.downloadRequests = [];
    window.testHardware = profile;
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === "detect_hardware") return window.testHardware;
      if (cmd === "download_model_file") {
        window.downloadRequests.push(args);
        throw new Error("Test intercepted download; no model files fetched");
      }
      return original(cmd, args);
    };
    window.__ws.getState().openModal({ kind: "engine", tab: "models" });
  }, profile);
  const summary = page.getByRole("status", { name: "Detected model memory" });
  await summary.waitFor();
  assert.match(await summary.innerText(), /shared GPU memory/);
  const krea = page.locator(".ws-card").filter({ has: page.getByText("Krea 2 Turbo", { exact: true }) });
  await krea.waitFor();
  assert.doesNotMatch(await krea.innerText(), /needs ~[\d.]+GB[^\n]*(out of reach|not this machine)/);
  assert.ok(await krea.getByRole("button", { name: "Get", exact: true }).first().isEnabled());
  const sd = page.locator(".ws-card").filter({ has: page.getByText("Stable Diffusion 1.5", { exact: true }) });
  await sd.getByRole("button", { name: "Get", exact: true }).first().click();
  await page.waitForFunction(() => window.downloadRequests.length > 0);
  const requests = await page.evaluate(() => window.downloadRequests);
  assert.match(requests[0].url, /^https:\/\//);
  await page.evaluate(() => {
    window.__ws.getState().closeModal();
    window.testHardware = { ...window.testHardware, gpus: [{ name: "Small discrete GPU", vendor: "amd", vram_mb: 4096, unified: false }] };
  });
  await summary.waitFor({ state: "hidden" });
  await page.evaluate(() => window.__ws.getState().openModal({ kind: "engine", tab: "models" }));
  await summary.waitFor();
  assert.match(await krea.innerText(), /out of reach/);
  assert.ok(await krea.getByRole("button", { name: "Get", exact: true }).first().isEnabled(), "Memory warning must not block a download");
  console.log("Model UI: real native UMA profile clears memory warnings; Get reaches the download command; small-GPU warnings remain advisory. No model downloaded.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
