import { test } from "node:test";
import assert from "node:assert/strict";
import { speechLanguages } from "./speechLanguages.ts";
import { qwenTtsLanguage } from "./latvianComfyTts.ts";
test("every adapter has an honest language control", () => {
  for (const provider of ["openai", "fish", "fish-local", "breeze", "voxtral"])
    assert.deepEqual(
      speechLanguages(provider, false).map((l) => l.value),
      ["Auto"],
    );
  assert(speechLanguages("qwen", false).some((l) => l.value === "French"));
  assert.equal(qwenTtsLanguage("Latvian"), "Auto");
  assert.equal(qwenTtsLanguage("French"), "French");
});
test("ElevenLabs uses only languages returned by the selected model", () => {
  const models = [
    {
      model_id: "eleven_v3",
      languages: [{ language_id: "lv", name: "Latvian" }],
    },
    { model_id: "other", languages: [{ language_id: "fr", name: "French" }] },
  ];
  assert.deepEqual(
    speechLanguages("elevenlabs", false, models).map((l) => l.value),
    ["Auto", "lv"],
  );
  assert.deepEqual(
    speechLanguages("elevenlabs", false).map((l) => l.value),
    ["Auto"],
  );
});
