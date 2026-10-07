import { storyHash } from "./storyHash.ts";
export interface StoryDialogueLine {
  id?: string;
  speaker_id: string | null;
  line: string;
  delivery?: string;
  offscreen?: boolean;
  language: string;
  emotion: string;
  intensity: number;
  pace: number;
}
export function normalizeDialogue(
  line: Partial<StoryDialogueLine>,
  language = "lv",
): StoryDialogueLine {
  const result = {
    ...line,
    language: line.language ?? language,
    emotion: line.emotion ?? "neutral",
    intensity: line.intensity ?? 0,
    pace: line.pace ?? 1,
  };
  if (
    !(result.speaker_id === null || (typeof result.speaker_id === "string" && result.speaker_id.length > 0)) ||
    typeof result.line !== "string" ||
    !result.language ||
    !Number.isFinite(result.intensity) ||
    result.intensity < 0 ||
    result.intensity > 1 ||
    !Number.isFinite(result.pace) ||
    result.pace <= 0
  )
    throw new Error(
      "Dialogue requires an identity, exact text, language, intensity 0–1 and positive pace",
    );
  return result as StoryDialogueLine;
}
export function checkDialogueCapability(
  line: StoryDialogueLine,
  provider: {
    languages: string[];
    controls: string[];
    verifiedLanguages?: string[];
  },
) {
  const errors: string[] = [];
  if (!provider.languages.includes(line.language))
    errors.push(`Provider does not declare ${line.language}`);
  if (!provider.verifiedLanguages?.includes(line.language))
    errors.push(
      `${line.language} requires a recorded listening verification before production`,
    );
  if (
    (line.emotion !== "neutral" || line.intensity !== 0) &&
    !provider.controls.includes("emotion")
  )
    errors.push("Provider does not support emotional direction");
  if (line.pace !== 1 && !provider.controls.includes("pace"))
    errors.push("Provider does not support rate control");
  return errors;
}
export async function dialogueCacheKey(
  line: StoryDialogueLine,
  voice: {
    rootEntryId: string;
    referenceAssetId: string;
    referenceRevision: number;
  },
  provider: { id: string; modelRevision: string },
) {
  return storyHash({ line: normalizeDialogue(line), voice, provider });
}
export function duckingEnvelope(
  speech: { startMs: number; endMs: number }[],
  durationMs: number,
  db = -12,
  attackMs = 80,
  releaseMs = 250,
) {
  if (
    !Number.isInteger(durationMs) ||
    durationMs <= 0 ||
    db > 0 ||
    attackMs < 0 ||
    releaseMs < 0
  )
    throw new Error("Invalid ducking profile");
  const intervals = speech
    .map((s) => {
      if (
        !Number.isInteger(s.startMs) ||
        !Number.isInteger(s.endMs) ||
        s.startMs < 0 ||
        s.endMs <= s.startMs ||
        s.endMs > durationMs
      )
        throw new Error(
          "Dialogue bounds must be integer milliseconds within the scene",
        );
      return s;
    })
    .sort((a, b) => a.startMs - b.startMs);
  const at = (t: number) =>
    Math.min(
      0,
      ...intervals.map((s) =>
        t < s.startMs
          ? db * Math.max(0, 1 - (s.startMs - t) / Math.max(1, attackMs))
          : t <= s.endMs
            ? db
            : db * Math.max(0, 1 - (t - s.endMs) / Math.max(1, releaseMs)),
      ),
    );
  const times = [
    ...new Set([
      0,
      durationMs,
      ...intervals.flatMap((s) => [
        Math.max(0, s.startMs - attackMs),
        s.startMs,
        s.endMs,
        Math.min(durationMs, s.endMs + releaseMs),
      ]),
    ]),
  ].sort((a, b) => a - b);
  // Intersections are sampled at 10 ms for overlapping ramps; the same envelope is consumed by preview and FFmpeg.
  if (intervals.length > 1)
    for (let t = 0; t < durationMs; t += 10) times.push(t);
  return [...new Set(times)]
    .sort((a, b) => a - b)
    .map((t) => ({ t_ms: t, db: at(t) || 0 }));
}
