import { QWEN_TTS_LANGUAGES } from "./latvianComfyTts.ts";
import { SUPERTONIC_LANGUAGES } from "./supertonicTts.ts";

export interface SpeechLanguage {
  value: string;
  label: string;
}
export interface SpeechModelLanguages {
  model_id: string;
  languages?: { language_id: string; name: string }[];
}
/** Enumerate the selected adapter's real controls, never a shared speculative list. */
export function speechLanguages(
  provider: string,
  latvian: boolean,
  models: SpeechModelLanguages[] = [],
): SpeechLanguage[] {
  const auto = { value: "Auto", label: "Auto (from text)" };
  if (provider === "supertonic-3") {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    return SUPERTONIC_LANGUAGES.map((value) => ({
      value,
      label: value === "na" ? "Language neutral" : (names.of(value) ?? value),
    }));
  }
  if (latvian || provider === "qwen")
    return QWEN_TTS_LANGUAGES.map((value) => ({
      value,
      label: value === "Latvian" ? "Latvian (Qwen Auto)" : value,
    }));
  if (provider === "elevenlabs")
    return [
      auto,
      ...(models.find((m) => m.model_id === "eleven_v3")?.languages ?? [])
        .filter((l) => /^[a-z]{2,3}$/.test(l.language_id))
        .map((l) => ({ value: l.language_id, label: l.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  // OpenAI, Fish, Breeze and Voxtral speech adapters have no language input.
  return [auto];
}
