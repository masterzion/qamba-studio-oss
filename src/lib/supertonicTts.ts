import type { EngineStatus } from "./desktop.ts";
import type { ModelCatalogRow } from "./db/types.ts";
import type { ApiGraph } from "./workflowAdapter.ts";
export const SUPERTONIC_ID = "local:supertonic-3/default";
export const SUPERTONIC_LANGUAGES =
  "en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi na".split(
    " ",
  );
export const SUPERTONIC_VOICES = "M1 M2 M3 M4 M5 F1 F2 F3 F4 F5".split(" ");
export const SUPERTONIC_FEELINGS = ["neutral", "happy", "sad", "angry", "surprised", "fearful", "disgusted"];
export interface SupertonicEffects {
  trim_silence: boolean;
  normalize_volume: boolean;
  clarity_boost: boolean;
  pitch_semitones: number;
  time_stretch: number;
  chorus_effect: boolean;
}
export const SUPERTONIC_DEFAULT_EFFECTS: SupertonicEffects = {
  trim_silence: true, normalize_volume: false, clarity_boost: false,
  pitch_semitones: 0, time_stretch: 1, chorus_effect: false,
};
export function supertonicRows(status: EngineStatus | null): ModelCatalogRow[] {
  if (!status?.live_comfy || !status.nodes.includes("SupertonicTTS")) return [];
  const ready =
    !!status.supertonic_ready &&
    ["SupertonicLoader", "SaveAudio"].every((n) => status.nodes.includes(n));
  return [
    {
      id: SUPERTONIC_ID,
      family: "supertonic-3",
      display_name: "Supertonic 3",
      kind: "audio",
      provider: "desktop",
      modes: ["tts"],
      sizes: [],
      max_seconds: null,
      fps: null,
      frame_base: null,
      frame_rem: null,
      dim_step: 1,
      pricing: {},
      sort: -21,
      enabled: ready,
      capabilities: {
        localFamily: "supertonic-3",
        ...(!ready
          ? {
              desktop: "blocked",
              desktopFix: "engine",
              desktopWhy:
                "Link the ComfyUI installation containing the complete Supertonic 3 cache; generation will not download weights.",
            }
          : {}),
      },
    },
  ];
}
export interface SupertonicInput {
  text?: string;
  language?: string;
  voice?: string;
  speed?: number;
  steps?: number;
  feeling?: string;
  emotion_intensity?: number;
  supertonic_effects?: Partial<SupertonicEffects>;
}
export function buildSupertonic(p: SupertonicInput, prefix: string): ApiGraph {
  if (!p.text?.trim()) throw new Error("Enter the exact dialogue to speak");
  const language = p.language ?? "en",
    voice = p.voice ?? "M1",
    speed = p.speed ?? 1,
    steps = p.steps ?? 8;
  if (!SUPERTONIC_LANGUAGES.includes(language))
    throw new Error("Unsupported Supertonic language");
  if (!SUPERTONIC_VOICES.includes(voice))
    throw new Error("Unsupported Supertonic voice");
  if (
    !Number.isFinite(speed) ||
    speed < 0.5 ||
    speed > 2 ||
    !Number.isInteger(steps) ||
    steps < 5 ||
    steps > 12
  )
    throw new Error("Supertonic requires speed 0.5–2 and 5–12 steps");
  const feeling = p.feeling ?? "neutral", intensity = p.emotion_intensity ?? 0.5;
  if (!SUPERTONIC_FEELINGS.includes(feeling)) throw new Error("Unsupported Supertonic feeling");
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1)
    throw new Error("Supertonic emotion intensity must be between 0 and 1");
  const effects = { ...SUPERTONIC_DEFAULT_EFFECTS, ...p.supertonic_effects };
  if (!Number.isFinite(effects.pitch_semitones) || effects.pitch_semitones < -12 || effects.pitch_semitones > 12)
    throw new Error("Supertonic pitch must be between -12 and 12 semitones");
  if (!Number.isFinite(effects.time_stretch) || effects.time_stretch < 0.5 || effects.time_stretch > 2)
    throw new Error("Supertonic time stretch must be between 0.5 and 2");
  for (const key of ["trim_silence", "normalize_volume", "clarity_boost", "chorus_effect"] as const)
    if (typeof effects[key] !== "boolean") throw new Error(`Supertonic ${key} must be a boolean`);
  return {
    1: { class_type: "SupertonicLoader", inputs: {} },
    2: {
      class_type: "SupertonicTTS",
      inputs: {
        model: ["1", 0],
        text: p.text,
        language,
        voice_style: voice,
        speed,
        steps,
        feeling,
        emotion_intensity: intensity,
      },
    },
    3: {
      class_type: "SupertonicEffects",
      inputs: { audio: ["2", 0], ...effects },
    },
    4: {
      class_type: "SaveAudio",
      inputs: { audio: ["3", 0], filename_prefix: prefix },
    },
  };
}
