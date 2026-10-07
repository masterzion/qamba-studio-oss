// Exercise the actual exported browser player, not the application's mock bridge.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const folder = fs.realpathSync.native(path.resolve(process.argv[2] ?? ""));
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/story-player-ui-test.mjs <exported-package>",
  );
const manifest = JSON.parse(
  fs.readFileSync(path.join(folder, "manifest.json"), "utf8"),
);
const graph = JSON.parse(
  fs.readFileSync(path.join(folder, "graph.json"), "utf8"),
);
const server = http.createServer((req, res) => {
  try {
    const relative =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(
        1,
      ) || "player.html";
    const full = fs.realpathSync.native(path.join(folder, relative));
    if (!full.startsWith(folder + path.sep)) throw new Error("Outside package");
    const types = {
      ".mjs": "text/javascript",
      ".html": "text/html",
      ".json": "application/json",
      ".vtt": "text/vtt",
      ".mp4": "video/mp4",
    };
    res.setHeader(
      "Content-Type",
      types[path.extname(full)] ?? "application/octet-stream",
    );
    fs.createReadStream(full).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Missing package file");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }),
  errors = [],
  witnesses = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}/player.html`;
fs.mkdirSync(".test-output/story-player", { recursive: true });
try {
  for (const language of manifest.languages ?? [manifest.language])
    for (let branch = 0; branch < 2; branch++) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page
        .waitForFunction(
          () => document.querySelector("#video").readyState >= 1,
          {},
          { timeout: 10000 },
        )
        .catch(async (error) => {
          throw new Error(
            `${error.message}; player status: ${await page.locator("#message").innerText()}`,
          );
        });
      if (language !== manifest.language)
        await page.locator("#speech").selectOption(language);
      await page.locator("#subtitles").selectOption(language);
      const decision = graph.nodes.find(
          (n) => n.content?.transitionMode === "choice",
        ),
        choice = decision.choices[branch];
      await page
        .getByRole("button", { name: choice.label[language], exact: true })
        .waitFor();
      const subtitles = await page
        .locator("#video")
        .evaluate((v) => ({
          language: v.querySelector("track")?.srclang,
          cues: [...(v.textTracks[0]?.cues ?? [])].map((c) => c.text),
          source: v.currentSrc,
        }));
      assert.equal(subtitles.language, language);
      assert.ok(subtitles.cues.length);
      assert.ok(subtitles.source.includes("/media/"));
      if (branch === 0 && language === manifest.language)
        await page.screenshot({
          path: ".test-output/story-player/scene-and-decisions.png",
        });
      await page
        .getByRole("button", { name: "Save progress", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Restore progress", exact: true })
        .click();
      await page
        .getByRole("button", { name: choice.label[language], exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: choice.label[language], exact: true })
        .click();
      for (let i = 0; i < 10; i++) {
        await page.waitForFunction(
          () =>
            document.querySelector("#message").textContent ===
              "Ending reached" ||
            document.querySelectorAll("#choices button").length > 0,
        );
        if ((await page.locator("#message").innerText()) === "Ending reached")
          break;
        await page.locator("#choices button").first().click();
      }
      assert.equal(
        await page.locator("#message").innerText(),
        "Ending reached",
      );
      const ending = await page.locator("#title").innerText();
      witnesses.push({
        language,
        branch,
        ending,
        subtitleText: subtitles.cues,
      });
      await page.screenshot({
        path: `.test-output/story-player/${language}-ending-${branch + 1}.png`,
      });
    }
  assert.notEqual(witnesses[0].ending, witnesses[1].ending);
  await page
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await page.evaluate((id) => {
    const key = `story:${id}`,
      saved = JSON.parse(localStorage.getItem(key));
    saved.graphHash = "invalid";
    localStorage.setItem(key, JSON.stringify(saved));
  }, manifest.storyId);
  await page
    .getByRole("button", { name: "Restore progress", exact: true })
    .click();
  assert.match(
    await page.locator("#message").innerText(),
    /another graph revision/,
  );
  await page.route("**/graph.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto(base, { waitUntil: "networkidle" });
  assert.match(await page.locator("#message").innerText(), /checksum mismatch/);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    ".test-output/story-player/browser-witnesses.json",
    JSON.stringify(witnesses, null, 2),
  );
  console.log(
    `Standalone exported player: ${witnesses.length} real video/subtitle branch playbacks, save/restore and tamper rejection passed.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
