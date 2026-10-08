import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localProfileFor,
  loadLocalProfiles,
  saveLocalProfiles,
  selectLocalTextProvider,
  saveLocalModelIds,
  loadLocalModelIds,
} from "./localProviderProfiles.ts";
import { lmStudioBackendId, lmStudioBackendModel, lmStudioModelBackends } from "./localTextRouting.ts";
test("selecting LM Studio routes text to its profile and preserves other roles", () => {
  const values = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    saveLocalProfiles([
      {
        id: "ollama",
        role: "text",
        protocol: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        modelId: "ollama-model",
        capabilities: ["tools"],
        timeoutMs: 10000,
      },
      {
        id: "lm",
        role: "text",
        protocol: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        modelId: "lm-model",
        capabilities: ["tools"],
        timeoutMs: 10000,
      },
      {
        id: "voice",
        role: "tts",
        protocol: "qamba-tts-v1",
        baseUrl: "http://127.0.0.1:8888",
        modelId: "voice-model",
        capabilities: [],
        timeoutMs: 10000,
      },
    ]);
    selectLocalTextProvider("lm-studio");
    assert.equal(localProfileFor("text")?.modelId, "lm-model");
    assert.equal(localProfileFor("tts")?.id, "voice");
    selectLocalTextProvider("ollama");
    assert.equal(localProfileFor("text")?.modelId, "ollama-model");
    assert.equal(loadLocalProfiles().length, 3);
    saveLocalModelIds("http://127.0.0.1:1234/v1", ["google/gemma-3-4b", "qwen:27b", "text-embedding-test", "qwen:27b"]);
    assert.deepEqual(loadLocalModelIds("http://127.0.0.1:1234/v1"), ["google/gemma-3-4b", "qwen:27b", "text-embedding-test"]);
    const rows = lmStudioModelBackends();
    assert.equal(rows.length, 4); // Include the saved model even if the server omits it.
    assert.equal(rows.find((row) => row.model === "google/gemma-3-4b")?.connection, "LM Studio");
    assert.equal(lmStudioBackendModel(lmStudioBackendId("qwen:27b/vendor")), "qwen:27b/vendor");
    assert.equal(lmStudioBackendModel("lm-studio:%ZZ"), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  }
});
