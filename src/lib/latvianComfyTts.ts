import presets from "./latvianTtsPresets.json" with { type: "json" };
import type { ApiGraph } from "./workflowAdapter.ts";
import type { ModelCatalogRow } from "./db/types.ts";
import type { EngineStatus } from "./desktop.ts";

export const LATVIAN_TTS_PREFIX = "local:latvian-tts/";
export const QWEN_TTS_LANGUAGES = [
  "Auto",
  "Latvian",
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "German",
  "French",
  "Russian",
  "Portuguese",
  "Spanish",
  "Italian",
] as const;
export function qwenTtsLanguage(language = "Latvian"): string {
  if (!(QWEN_TTS_LANGUAGES as readonly string[]).includes(language))
    throw new Error(`Unsupported Qwen TTS language: ${language}`);
  return language === "Latvian" ? "Auto" : language;
}
export const LATVIAN_TTS_PRESETS = presets;
export const latvianPreset = (id?: string | null) =>
  presets.find((p) => id === p.id || id === LATVIAN_TTS_PREFIX + p.id);
export const isLatvianTts = (id?: string | null) =>
  !!id?.startsWith(LATVIAN_TTS_PREFIX);
export function latvianTtsRows(status: EngineStatus | null): ModelCatalogRow[] {
  if (!status?.live_comfy) return [];
  const need = [
    "LoadAudio",
    "LatvianQwenReference",
    "LatvianAudioEffects",
    "SaveAudio",
  ];
  const missing = need.filter((name) => !status.nodes.includes(name));
  return presets.map((p, i) => ({
    id: LATVIAN_TTS_PREFIX + p.id,
    family: "latvian-tts",
    display_name: `Latvian Qwen TTS · ${p.label}`,
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
    sort: -20 + i,
    enabled: missing.length === 0,
    capabilities: {
      ...(missing.length
        ? {
            desktop: "blocked",
            desktopFix: "engine",
            desktopWhy: `ComfyUI is missing ${missing.join(", ")}`,
          }
        : {}),
      localFamily: "latvian-tts",
      referenceAudio: true,
      language: "Auto",
      workflow: p.source,
    },
  }));
}

export interface LatvianTtsInput {
  instruct?: string;
  language?: string;
  model_id?: string;
  text?: string;
  seed?: number;
  reference_asset_id?: string;
  reference_text?: string;
  max_new_tokens?: number;
  tts_effects?: {
    trim_silence?: boolean;
    normalize_volume?: boolean;
    clarity_boost?: boolean;
    pitch_semitones?: number;
    time_stretch?: number;
    chorus_effect?: boolean;
  };
}

export function buildLatvianTts(
  id: string,
  p: LatvianTtsInput,
  prefix: string,
  uploadedAudio?: string,
): ApiGraph {
  const preset = latvianPreset(id);
  if (!preset) throw new Error("Unknown Latvian speech workflow");
  if (!p.text?.trim()) throw new Error("Enter the exact dialogue to speak");
  if (p.reference_asset_id && !p.reference_text?.trim())
    throw new Error("Enter the exact transcript of your reference audio");
  const tokens =
    p.max_new_tokens ?? Number(preset.api["2"].inputs.max_new_tokens);
  if (!Number.isInteger(tokens) || tokens < 32 || tokens > 4096)
    throw new Error("Audio token limit must be 32–4096");
  const effects = p.tts_effects ?? {};
  if (
    effects.pitch_semitones !== undefined &&
    (!Number.isFinite(effects.pitch_semitones) ||
      Math.abs(effects.pitch_semitones) > 12)
  )
    throw new Error("Pitch must be between -12 and 12 semitones");
  if (
    effects.time_stretch !== undefined &&
    (!Number.isFinite(effects.time_stretch) ||
      effects.time_stretch < 0.5 ||
      effects.time_stretch > 2)
  )
    throw new Error("Duration multiplier must be between 0.5 and 2");
  const graph = structuredClone(preset.api) as ApiGraph;
  graph["1"].inputs.audio = uploadedAudio ?? graph["1"].inputs.audio;
  graph["2"].inputs.text = p.text; // The input is spoken verbatim; no prompt enhancement.
  graph["2"].inputs.reference_text =
    p.reference_text ?? graph["2"].inputs.reference_text;
  graph["2"].inputs.language = qwenTtsLanguage(p.language);
  graph["2"].inputs.seed = p.seed ?? 42;
  graph["2"].inputs.max_new_tokens = tokens;
  if (p.instruct?.trim()) graph["2"].inputs.instruct = p.instruct.trim();
  Object.assign(graph["4"].inputs, effects);
  graph["3"].inputs.filename_prefix = prefix;
  return graph;
}
