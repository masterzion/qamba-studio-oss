import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localProfileFor,
  loadLocalProfiles,
  saveLocalProfiles,
  selectLocalTextProvider,
} from "./localProviderProfiles.ts";
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
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  }
});
