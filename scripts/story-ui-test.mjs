import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch(
  process.env.CHROME
    ? { executablePath: process.env.CHROME, headless: true }
    : { channel: "chrome", headless: true },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    `${process.env.BASE ?? "http://localhost:5177"}/ui/story?desktop=rtx4090`,
    { waitUntil: "networkidle" },
  );
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await page.getByRole("button", { name: "Start / restart" }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  assert.match(
    await page.locator("pre").first().innerText(),
    /"suspicion": 10/,
  );
  assert.match(
    await page.locator("pre").first().innerText(),
    /"injured": false/,
  );
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  await page.getByText("Ending reached:", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Start / restart" }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  assert.match(
    await page.locator("pre").first().innerText(),
    /"suspicion": 35/,
  );
  assert.match(
    await page.locator("pre").first().innerText(),
    /"injured": true/,
  );
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await page
    .getByRole("button", { name: "Validate & analyze", exact: true })
    .click();
  await page.getByText('"proof": "proven"', { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Historical Bible", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Historical Bible and original sources" })
    .waitFor();
  await page
    .getByRole("button", { name: "Local providers", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Local provider profiles" })
    .waitFor();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", { name: "Validate and export package…" })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Approve a scene" })
    .waitFor();
  await page.getByRole("button", { name: "Story Graph", exact: true }).click();
  assert.equal(await page.locator(".react-flow__node").count(), 8);
  await page.locator(".story-node-scene strong").filter({ hasText: "Station" }).click();
  await page.getByRole("combobox", { name: "Scene timeline", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Edit scene shots", exact: true }).count(), 0);
  await page.getByRole("button", { name: "New story", exact: true }).click();
  await page.getByLabel("Additional languages", { exact: true }).fill("en");
  await page.getByRole("button", { name: "Create story", exact: true }).click();
  await page
    .waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 3,
    )
    .catch(async (e) => {
      console.log(
        "Story creation debug",
        page.url(),
        await page.locator("body").innerText(),
        errors,
      );
      throw e;
    });
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Scene 1" })
    .locator("strong")
    .click();
  await page.getByRole("combobox", { name: "Scene timeline", exact: true }).waitFor();
  await page.getByRole("button", { name: "Create scene timeline", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Scene timeline"]').value !== "");
  const originalSceneTimeline = await page.getByRole("combobox", { name: "Scene timeline", exact: true }).inputValue();
  await page
    .getByRole("button", { name: "Add dialogue line", exact: true })
    .click();
  await page
    .getByLabel("Exact dialogue · lv", { exact: true })
    .fill("Rīga — viņš nāk.");
  await page.getByLabel("Story language", { exact: true }).selectOption("en");
  assert.equal(
    await page.getByLabel("Exact dialogue · en", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByLabel("Exact dialogue · en", { exact: true })
    .fill("He is coming to Riga.");
  await page.getByLabel("Story language", { exact: true }).selectOption("lv");
  assert.equal(
    await page.getByLabel("Exact dialogue · lv", { exact: true }).inputValue(),
    "Rīga — viņš nāk.",
  );
  await page.evaluate(() => {
    window.storyOriginalInvoke = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = async (cmd, ...args) => {
      if (cmd === "local_store_save")
        throw new Error("Synthetic disk write failure");
      return window.storyOriginalInvoke(cmd, ...args);
    };
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Synthetic disk write failure" })
    .waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: /^Save failed$/ })
    .waitFor();
  await page.evaluate(() => {
    window.__TAURI__.core.invoke = window.storyOriginalInvoke;
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Scene transition", { exact: true })
    .selectOption("choice");
  await page.getByRole("button", { name: "Add choice", exact: true }).click();
  await page
    .getByLabel("Choice label", { exact: true })
    .last()
    .fill("Iet uz staciju");
  await page.getByRole("button", { name: "Add START", exact: true }).click();
  await page.locator(".react-flow__node.selected .story-node-start").waitFor();
  assert.equal(await page.locator(".story-node-start").count(), 1);
  assert.equal(await page.locator(".story-node-start .story-node-icon svg").count(), 1);
  assert.equal(await page.locator(".story-node-scene .story-node-icon svg").count(), 1);
  assert.equal(await page.locator(".story-node-ending .story-node-icon svg").count(), 1);
  await page.getByRole("button", { name: "Add START", exact: true }).click();
  assert.equal(await page.locator(".story-node-start").count(), 1);
  await page.getByRole("button", { name: "Add SCENE", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length === 4,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length === 3,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length === 4,
  );
  fs.mkdirSync(".test-output/story-ui", { recursive: true });
  await page.screenshot({
    path: ".test-output/story-ui/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".test-output/story-ui/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".react-flow__controls-fitview").click();
  await page.locator(".story-node-scene strong").first().dblclick();
  await page.waitForURL(/\/timeline\?timeline=/);
  const sceneTimelineUrl = new URL(page.url());
  assert.equal(sceneTimelineUrl.searchParams.get("lang"), "lv");
  assert.ok(sceneTimelineUrl.searchParams.get("node"));
  assert.equal(sceneTimelineUrl.searchParams.get("timeline"), originalSceneTimeline);
  // This isolated UI fixture does not mount production workspace routes.
  // Verify the scene-specific navigation and reuse, then return to the fixture.
  await page.goBack();
  await page.locator(".react-flow__controls-fitview").click();
  await page.locator(".story-node-scene strong").first().dblclick();
  await page.waitForURL(/\/timeline\?timeline=/);
  assert.equal(new URL(page.url()).searchParams.get("timeline"), sceneTimelineUrl.searchParams.get("timeline"));
  await page.goto(
    `${process.env.BASE ?? "http://localhost:5177"}/ui/local?desktop=rtx4090`,
    { waitUntil: "networkidle" },
  );
  await page.getByTestId("make-local").click();
  await page.getByTestId("open-rail").click();
  const mode = page.getByRole("combobox", {
    name: "Narrative mode",
    exact: true,
  });
  await mode.selectOption("interactive");
  await page
    .getByText("Saved as this project's default.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: ".test-output/story-ui/project-settings.png",
    fullPage: true,
  });
  await page.getByTestId("open-rail").click();
  await page.getByTestId("open-settings").click();
  await page.waitForFunction(() => {
    const select = [...document.querySelectorAll(".ws-scrim select")].find(
      (el) => [...el.options].some((option) => option.value === "interactive"),
    );
    return select?.value === "interactive";
  });
  assert.deepEqual(errors, []);
  console.log(
    "Story UI: both paths, state, analysis worker, history/provider screens, export blocker and saved narrative mode passed. Browser mock only.",
  );
} catch(error) {
  console.error("Story UI failure state",await page.locator("body").innerText(),errors);
  await page.screenshot({path:".test-output/story-ui/failure.png",fullPage:true});throw error;
} finally {
  await browser.close();
}
