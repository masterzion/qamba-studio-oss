import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1984, height: 1200 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const models = (await (await fetch("http://127.0.0.1:1234/v1/models")).json()).data.map((m) => m.id);
try {
  await page.goto(`${process.env.BASE ?? "http://localhost:5177"}/ui/local?desktop=rtx4090`, { waitUntil: "networkidle" });
  await page.getByTestId("make-local").click();
  await page.waitForFunction(() => Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows") ?? "{}")).length > 0);
  const projectId = await page.evaluate(() => {
    localStorage.setItem("qamba.desktop.setup", JSON.stringify({ engine: "local", comfyUrl: "http://127.0.0.1:8188", preset: null, completedAt: new Date().toISOString() }));
    return Object.keys(JSON.parse(sessionStorage.getItem("qamba.mock.local.rows")))[0];
  });
  await page.goto(`${process.env.BASE ?? "http://localhost:5177"}/project/${projectId}/bible?desktop=rtx4090&engine=running`, { waitUntil: "networkidle" });
  await page.evaluate((models) => {
    const original = window.__TAURI__.core.invoke;
    window.localChatRequests = [];
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === "local_provider_models") return models;
      if (cmd === "local_provider_chat") {
        window.localChatRequests.push(args);
        const messages = args.body.messages;
        const message = args.body.tools?.length && !messages.some((m) => m.role === "tool")
          ? { content: "", tool_calls: [{ id: "call-local", type: "function", function: { name: "report_status", arguments: '{"status":"ready"}' } }] }
          : { content: "READY" };
        return { choices: [{ message }] };
      }
      return original(cmd, args);
    };
    window.__ws.getState().openModal({ kind: "engine", tab: "llm" });
  }, models);
  await page.getByLabel("Local text provider").selectOption("lm-studio");
  await page.getByRole("button", { name: "Check connection and list models" }).click();
  await page.getByRole("status").filter({ hasText: `Connected: ${models.length} available model(s)` }).waitFor();
  const selector = page.getByLabel("LM Studio model ID", { exact: true });
  assert.equal(await selector.locator("option").count(), models.length + 1);
  await selector.selectOption(models[0]);
  await page.getByLabel("This model supports tool calls (required for the director)").check();
  await page.getByRole("button", { name: "Use LM Studio", exact: true }).click();
  await page.evaluate(() => window.__ws.getState().closeModal());
  await page.locator(".ws-llmchip").click();
  assert.equal(await page.locator(".ws-modelpick .chip").filter({ hasText: /^LM Studio$/ }).count(), models.length);
  const chosen = models.find((m) => m.includes("ornith-gamedev")) ?? models[1];
  await page.getByRole("button", { name: new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " LM Studio") }).click();
  assert.equal(await page.locator(".ws-llmchip .nm").innerText(), chosen);
  const result = await page.evaluate(async (chosen) => {
    const { desktopTurn, localOneShot, pipelineBackendId } = await import("/src/lib/director.ts");
    const { lmStudioBackendId } = await import("/src/lib/localTextRouting.ts");
    const { runLocalDirectorTurn } = await import("/src/lib/localDirector.ts");
    const { activeLocalStore, __adoptLocalStore, setActiveLocalProject } = await import("/src/lib/localPlane.ts");
    const { LocalStore } = await import("/src/lib/localStore.ts");
    const { selectLocalTextProvider } = await import("/src/lib/localProviderProfiles.ts");
    selectLocalTextProvider("ollama"); // An explicit LM Studio choice must override this default.
    const id = lmStudioBackendId(chosen), desk = await desktopTurn(id);
    const store = activeLocalStore() ?? new LocalStore("60000000-0000-4000-8000-000000000001", "local-fixture");
    if (!activeLocalStore()) {
      store.insert("projects", [{ id: store.projectId, title: "Local routing test", settings: {} }]);
      __adoptLocalStore(store); setActiveLocalProject(store.projectId);
    }
    const project = store.find("projects", store.projectId);
    store.update("projects", [project], { settings: { ...project.settings, offline_only: true } });
    let toolCalls = 0;
    const turn = await runLocalDirectorTurn({ system: "Test local model routing", history: [{ role: "user", content: "Report ready" }], model: desk.model, chat: desk.chat, ctx: {},
      toolset: { tools: [{ name: "report_status", description: "Report status", input_schema: { type: "object", properties: { status: { type: "string" } } } }], names: new Set(["report_status"]), run: async () => { toolCalls++; return { ok: true }; } } });
    const oneShot = await localOneShot("Test", "Reply READY", id);
    return { toolCalls, text: turn.text, oneShot, pipeline: pipelineBackendId(id), requests: window.localChatRequests };
  }, chosen);
  assert.equal(result.toolCalls, 1);
  assert.equal(result.text, "READY");
  assert.equal(result.oneShot.text, "READY");
  assert.equal(result.pipeline, "openai-compat");
  assert.ok(result.requests.length >= 3);
  assert.ok(result.requests.every((req) => req.profile.modelId === chosen && req.profile.protocol === "openai-compatible"));
  assert.deepEqual(errors, []);
  fs.mkdirSync(".test-output/local-text", { recursive: true });
  await page.screenshot({ path: ".test-output/local-text/director.png" });
  console.log(`LM Studio: all ${models.length} settings/menu models, exact-model selection, offline tool loop and one-shot routing passed. Browser/native mock; model list from live server.`);
} catch (error) {
  console.error(await page.locator("body").innerText(), errors);
  throw error;
} finally { await browser.close(); }
