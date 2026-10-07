import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSupertonic, supertonicRows } from "./supertonicTts.ts";
import { speechLanguages } from "./speechLanguages.ts";
test("Supertonic passes the selected language and exact text to its own node", () => {
  const graph = buildSupertonic(
    { text: "Labdien!", language: "lv", voice: "F2", speed: 1.1, steps: 9 },
    "test",
  );
  assert.equal(graph["2"].inputs.language, "lv");
  assert.equal(graph["2"].inputs.text, "Labdien!");
  assert.equal(graph["2"].inputs.voice_style, "F2");
  assert(speechLanguages("supertonic-3", false).some((l) => l.value === "lv"));
  assert.throws(() =>
    buildSupertonic({ text: "hi", language: "Auto" }, "test"),
  );
});
test("installed nodes alone cannot enable Supertonic's automatic downloading loader", () => {
  const status = {
    live_comfy: true,
    nodes: ["SupertonicTTS", "SupertonicLoader", "SaveAudio"],
  } as any;
  assert.equal(supertonicRows(status)[0].enabled, false);
  assert.equal(
    supertonicRows({ ...status, supertonic_ready: true })[0].enabled,
    true,
  );
});
test("custom Supertonic forwards feeling, intensity and effects before saving audio", () => {
  const graph = buildSupertonic({ text: "I hate you.", language: "en", feeling: "angry", emotion_intensity: 0.8,
    supertonic_effects: { clarity_boost: true, pitch_semitones: 1, time_stretch: 0.95, chorus_effect: true } }, "feelings");
  assert.equal(graph["2"].inputs.feeling, "angry");
  assert.equal(graph["2"].inputs.emotion_intensity, 0.8);
  assert.equal(graph["2"].inputs.text, "I hate you.");
  assert.equal(graph["3"].class_type, "SupertonicEffects");
  assert.deepEqual(graph["3"].inputs, { audio: ["2", 0], trim_silence: true, normalize_volume: true,
    clarity_boost: true, pitch_semitones: 1, time_stretch: 0.95, chorus_effect: true });
  assert.deepEqual(graph["4"].inputs.audio, ["3", 0]);
  assert.equal(graph["4"].inputs.filename_prefix, "feelings");
});
test("Supertonic accepts zero intensity and rejects invalid controls", () => {
  assert.equal(buildSupertonic({ text: "hi", emotion_intensity: 0 }, "test")["2"].inputs.emotion_intensity, 0);
  for (const patch of [
    { feeling: "furious" }, { emotion_intensity: -0.1 }, { emotion_intensity: 1.1 }, { emotion_intensity: NaN },
    { supertonic_effects: { pitch_semitones: 13 } }, { supertonic_effects: { pitch_semitones: NaN } },
    { supertonic_effects: { time_stretch: 0 } }, { supertonic_effects: { chorus_effect: "true" } },
  ]) assert.throws(() => buildSupertonic({ text: "hi", ...patch } as any, "test"));
});
