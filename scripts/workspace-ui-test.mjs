import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1984, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const base = process.env.BASE ?? "http://localhost:5177";
  await page.goto(`${base}/ui/local?desktop=rtx4090`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("make-local").click();
  await page.evaluate(() =>
    localStorage.setItem(
      "qamba.desktop.setup",
      JSON.stringify({
        engine: "local",
        comfyUrl: "http://127.0.0.1:8188",
        preset: null,
        completedAt: new Date().toISOString(),
      }),
    ),
  );
  await page.waitForFunction(
    () =>
      Object.keys(
        JSON.parse(sessionStorage.getItem("qamba.mock.local.rows") ?? "{}"),
      ).length > 0,
  );
  const pid = await page.evaluate(
    () =>
      Object.keys(
        JSON.parse(sessionStorage.getItem("qamba.mock.local.rows")),
      )[0],
  );
  await page.goto(
    `${base}/project/${pid}/bible?desktop=rtx4090&engine=running`,
    { waitUntil: "networkidle" },
  );
  await page
    .getByRole("button", { name: "Style & models", exact: true })
    .waitFor();
  await page.locator(".ws-build").waitFor();
  assert.match(await page.title(), /Qamba Studio v.*build \d{4}-\d{2}-\d{2}/);
  fs.mkdirSync(".test-output/workspace", { recursive: true });
  for (const width of [1984, 1400, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    console.log(
      JSON.stringify(
        await page.evaluate(() => {
          const selectors = [
            ".ws",
            ".ws-top",
            ".ws-top-right",
            ".ws-body",
            ".ws-main",
            ".ws-viewhead",
          ];
          return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            boxes: selectors.map((selector) => {
              const el = document.querySelector(selector),
                r = el.getBoundingClientRect();
              return {
                selector,
                x: r.x,
                width: r.width,
                right: r.right,
                scrollWidth: el.scrollWidth,
              };
            }),
            button: [...document.querySelectorAll("button")]
              .filter((b) => b.textContent.includes("Style & models"))
              .map((b) => {
                const r = b.getBoundingClientRect();
                return {
                  x: r.x,
                  right: r.right,
                  display: getComputedStyle(b).display,
                };
              }),
          };
        }),
      ),
    );
    await page.screenshot({
      path: `.test-output/workspace/bible-${width}.png`,
    });
    const styleButton = page.getByRole("button", {
      name: "Style & models",
      exact: true,
    });
    const box = await styleButton.boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= width,
      `Style button outside viewport at ${width}`,
    );
    await styleButton.click();
    await page
      .getByRole("combobox", { name: "Narrative mode", exact: true })
      .waitFor();
    await page.evaluate(() => window.__ws.getState().closeModal());
  }
  await page.evaluate(() => {
    document.querySelector(".ws").style.zoom = "1.5";
  });
  console.log(
    "Original toolbar at 150% zoom:",
    await page.evaluate(() => {
      const head = document.querySelector(".ws-viewhead");
      const button = [...head.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Style & models"),
      );
      const tabs = head.querySelector(".ws-nav");
      head.style.flexWrap = "nowrap";
      tabs.style.flexWrap = "nowrap";
      head.insertBefore(button, head.lastElementChild);
      const originalRight = button.getBoundingClientRect().right;
      const availableRight = document
        .querySelector(".ws-main")
        .getBoundingClientRect().right;
      head.insertBefore(button, head.children[1]);
      head.style.removeProperty("flex-wrap");
      tabs.style.removeProperty("flex-wrap");
      return {
        originalRight,
        availableRight,
        clipped: originalRight > availableRight,
      };
    }),
  );
  await page
    .getByRole("button", { name: "Style & models", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Narrative mode", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.__ws.getState().closeModal();
    document.querySelector(".ws").style.zoom = "1";
    window.__ws.getState().openModal({ kind: "engine" });
  });
  await page.getByRole("tab", { name: "Local LLM", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Local text provider", exact: true })
    .selectOption("lm-studio");
  await page
    .getByRole("button", {
      name: "Check connection and list models",
      exact: true,
    })
    .click();
  await page
    .getByText("Connected: 1 available model(s)", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Use LM Studio", exact: true })
    .click();
  await page
    .getByText("LM Studio selected: test-lm-studio-model", { exact: true })
    .waitFor();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qamba.local-provider-profiles.v1")),
  );
  assert.equal(stored[0].modelId, "test-lm-studio-model");
  assert.equal(stored[0].protocol, "openai-compatible");
  if (process.env.CHECK_COMFY_INVENTORY) {
    await page.setViewportSize({ width: 1984, height: 1200 });
    const info = await (
      await fetch("http://127.0.0.1:8188/object_info")
    ).json();
    await page.evaluate(async (info) => {
      window.__ws.getState().closeModal();
      const previous = window.__TAURI__.http.fetch;
      const invoke = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = async (cmd, ...args) => {
        const result = await invoke(cmd, ...args);
        return cmd === "engine_status"
          ? { ...result, supertonic_ready: true }
          : result;
      };
      window.__TAURI__.http.fetch = async (url, init) =>
        String(url).includes("/object_info")
          ? new Response(JSON.stringify(info), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : previous(url, init);
      const { refreshLocalEngine } =
        await import("/src/hooks/useLocalEngine.ts");
      refreshLocalEngine();
      window.__ws.setState({ panel: "audio", panelOpen: true });
    }, info);
    await page
      .getByRole("combobox", { name: "Speech language", exact: true })
      .waitFor();
    await page.locator(".av-modelline").filter({ hasText: "Supertonic 3" }).waitFor({ timeout: 45000 });
    await page.locator(".av-modelline").first().click();
    await page
      .getByText(/Dramatic male · Qwen base/, { exact: false })
      .last()
      .click();
    await page.getByLabel("Exact words spoken in the reference").waitFor();
    await page.getByLabel("Audio token limit").fill("256");
    const instruct = page.getByLabel("Instruct · feelings and delivery");
    await instruct.fill("Speak in a furious, seething, enraged tone. Maintain clear Latvian pronunciation.");
    assert.match(await instruct.inputValue(), /furious/);
    await page
      .getByRole("combobox", { name: "Speech language", exact: true })
      .selectOption("French");
    assert.equal(
      await page
        .getByRole("combobox", { name: "Speech language", exact: true })
        .inputValue(),
      "French",
    );
    await page
      .getByRole("combobox", { name: "Speech language", exact: true })
      .selectOption("Latvian");
    await page.getByLabel("Duration multiplier").fill("1.2");
    await page.screenshot({ path: ".test-output/workspace/latvian-tts.png" });
    console.log(
      "Latvian TTS preset selection and reference/effect controls passed",
    );
    await page.locator(".av-modelline").first().click();
    await page.getByText("Supertonic 3", { exact: true }).last().click();
    await page
      .getByRole("combobox", { name: "Speech language", exact: true })
      .selectOption("lv");
    await page
      .getByRole("combobox", { name: "Supertonic voice style" })
      .selectOption("F2");
    assert.equal(
      await page
        .getByRole("combobox", { name: "Speech language", exact: true })
        .inputValue(),
      "lv",
    );
    await page.getByLabel("Supertonic feeling", { exact: true }).selectOption("angry");
    await page.getByLabel("Supertonic feeling intensity", { exact: true }).fill("0.8");
    await page.getByLabel("Supertonic pitch semitones", { exact: true }).fill("1");
    await page.getByLabel("Supertonic time stretch", { exact: true }).fill("0.95");
    await page.getByLabel("Supertonic clarity boost", { exact: true }).check();
    await page.getByLabel("Supertonic chorus", { exact: true }).check();
    assert.equal(await page.getByLabel("Supertonic feeling", { exact: true }).inputValue(), "angry");
    assert.equal(await page.getByLabel("Supertonic feeling intensity", { exact: true }).inputValue(), "0.8");
    assert.equal(await page.getByLabel("Supertonic pitch semitones", { exact: true }).inputValue(), "1");
    await page.screenshot({ path: ".test-output/workspace/supertonic-3.png" });
    console.log("Supertonic language, voice, feeling, intensity and effects controls passed");
  }
  assert.deepEqual(errors, []);
  console.log("Runtime errors:", errors);
} finally {
  await browser.close();
}
