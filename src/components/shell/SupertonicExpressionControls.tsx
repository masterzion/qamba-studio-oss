import React from "react";
import { SUPERTONIC_FEELINGS, SUPERTONIC_DEFAULT_EFFECTS, type SupertonicInput, type SupertonicEffects } from "../../lib/supertonicTts";
export type SupertonicExpressionSettings = Pick<SupertonicInput, "feeling" | "emotion_intensity" | "supertonic_effects">;
export default function SupertonicExpressionControls({ value, onChange }: {
  value: SupertonicExpressionSettings; onChange: (value: SupertonicExpressionSettings) => void;
}) {
  const effects = { ...SUPERTONIC_DEFAULT_EFFECTS, ...value.supertonic_effects };
  const patchEffect = (patch: Partial<SupertonicEffects>) => onChange({ ...value, supertonic_effects: { ...effects, ...patch } });
  const fieldStyle: React.CSSProperties = { display: "grid", gap: 5, width: "100%" };
  return <fieldset style={{ width: "100%", minWidth: 0, display: "grid", gap: 10, border: "1px solid #344157", borderRadius: 8, padding: 12, margin: 0 }}>
    <legend>Feelings and audio effects</legend>
    <label style={fieldStyle}>Feeling<select className="av-text" aria-label="Supertonic feeling" value={value.feeling ?? "neutral"}
      onChange={(e) => onChange({ ...value, feeling: e.target.value })}>
      {SUPERTONIC_FEELINGS.map((feeling) => <option key={feeling}>{feeling}</option>)}
    </select></label>
    <label style={fieldStyle}>Feeling intensity (0–1)<input className="av-inp" aria-label="Supertonic feeling intensity" type="number" min="0" max="1" step="0.05"
      value={value.emotion_intensity ?? 0.5} onChange={(e) => onChange({ ...value, emotion_intensity: Number(e.target.value) })} /></label>
    <p className="av-hint">Your current Supertonic node stores feeling and intensity as metadata; it does not condition the voice on them. Audio effects below alter the generated sound.</p>
    {([
      ["trim_silence", "Trim silence"], ["normalize_volume", "Normalize volume"],
      ["clarity_boost", "Clarity boost"], ["chorus_effect", "Chorus"],
    ] as const).map(([key, label]) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <input aria-label={`Supertonic ${label.toLowerCase()}`} type="checkbox" checked={effects[key]}
        onChange={(e) => patchEffect({ [key]: e.target.checked })} />{label}
    </label>)}
    <label style={fieldStyle}>Pitch (semitones)<input className="av-inp" aria-label="Supertonic pitch semitones" type="number" min="-12" max="12" step="0.5"
      value={effects.pitch_semitones} onChange={(e) => patchEffect({ pitch_semitones: Number(e.target.value) })} /></label>
    <label style={fieldStyle}>Time stretch<input className="av-inp" aria-label="Supertonic time stretch" type="number" min="0.5" max="2" step="0.05"
      value={effects.time_stretch} onChange={(e) => patchEffect({ time_stretch: Number(e.target.value) })} /></label>
  </fieldset>;
}
