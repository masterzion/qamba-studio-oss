import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const source = process.argv[2];
if (!source)
  throw new Error("Pass a PNG file path to test the local library upload");
const original = fs.readFileSync(source);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(
    `${process.env.BASE ?? "http://localhost:5177"}/ui/storylibrary?desktop=rtx4090`,
    { waitUntil: "networkidle" },
  );
  await page.locator('.ws-drop input[type="file"]').setInputFiles(source);
  await page.waitForFunction(() => {
    const image = document.querySelector(".ws-libcell img");
    return (
      image?.complete &&
      image.naturalWidth > 0 &&
      !document.body.innerText.includes("Uploading")
    );
  });
  const stored = await page.evaluate(
    () =>
      Object.values(
        JSON.parse(sessionStorage.getItem("qamba.mock.local.media") ?? "{}"),
      )[0],
  );
  const copied = Buffer.from(stored, "base64");
  assert.equal(
    createHash("sha256").update(copied).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
  );
  fs.mkdirSync(".test-output/story-ui", { recursive: true });
  await page.screenshot({
    path: ".test-output/story-ui/library-upload.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    const invoke = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (command, ...args) =>
      command === "local_media_write"
        ? Promise.reject(new Error("Test disk write refused"))
        : invoke(command, ...args);
  });
  await page.locator('.ws-drop input[type="file"]').setInputFiles(source);
  await page.getByText("Test disk write refused", { exact: false }).waitFor();
  assert.equal(await page.locator(".ws-libcell").count(), 1);
  assert.equal(
    await page.getByText("Uploading 0%…", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    `Local library upload passed: ${original.length} exact bytes, visible image and visible failure. Browser mock only.`,
  );
} finally {
  await browser.close();
}
