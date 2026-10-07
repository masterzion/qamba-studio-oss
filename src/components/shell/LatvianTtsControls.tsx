import React, { useRef, useState } from "react";
import type { Asset } from "../../lib/db/types";
import { registerAsset } from "../../lib/db/assets";
import { uploadMedia } from "../../lib/upload";
import { probedUploadMeta } from "../../lib/mediaProbe";
import { latvianPreset, type LatvianTtsInput } from "../../lib/latvianComfyTts";

export default function LatvianTtsControls({
  modelId,
  projectId,
  assets,
  value,
  onChange,
  onError,
}: {
  modelId: string;
  projectId: string;
  assets: Asset[];
  value: LatvianTtsInput;
  onChange: (value: LatvianTtsInput) => void;
  onError: (message: string) => void;
}) {
  const preset = latvianPreset(modelId)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<Asset | null>(null);
  const refs =
    uploaded && !assets.some((a) => a.id === uploaded.id)
      ? [...assets, uploaded]
      : assets;
  const patch = (p: Partial<LatvianTtsInput>) => onChange({ ...value, ...p });
  const effects = { ...preset.api["4"].inputs, ...value.tts_effects };
  const effect = (p: NonNullable<LatvianTtsInput["tts_effects"]>) =>
    patch({ tts_effects: { ...value.tts_effects, ...p } });
  const upload = async (file: File) => {
    setUploading(0);
    try {
      const key = `audio/${projectId}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "wav"}`;
      await uploadMedia(file, key, setUploading);
      const asset = await registerAsset({
        b2_key: key,
        project_id: projectId,
        kind: "audio",
        content_type: file.type || "audio/wav",
        bytes: file.size,
        ...(await probedUploadMeta(file)),
        origin: "uploaded",
        tags: ["library", "voice-reference"],
        meta: { filename: file.name },
      });
      setUploaded(asset);
      patch({ reference_asset_id: asset.id, reference_text: "" });
    } catch (e) {
      onError(`Reference upload failed: ${String((e as Error).message)}`);
    } finally {
      setUploading(null);
    }
  };
  return (
    <div className="av-clone">
      <label>
        Instruct · feelings and delivery
        <textarea className="av-text" rows={4}
          placeholder="Speak in a furious, seething, enraged tone, with a sharp and hard voice. Maintain clear, intelligible Latvian pronunciation."
          value={value.instruct ?? ""}
          onChange={(e) => patch({ instruct: e.target.value })} />
      </label>
      <span className="av-hint">
        Leave blank to preserve the reference voice. An instruction uses the installed
        VoiceDesign model to create an expressive reference, then the Latvian Base
        model speaks your text. This changes voice identity. Restart ComfyUI after
        installing the updated Qwen node to enable this input.
      </span>
      <label>
        Reference audio
        <select
          className="av-text"
          value={value.reference_asset_id ?? ""}
          onChange={(e) =>
            patch({
              reference_asset_id: e.target.value || undefined,
              reference_text: e.target.value ? "" : undefined,
            })
          }
        >
          <option value="">
            Workflow sample: {preset.api["1"].inputs.audio}
          </option>
          {refs
            .filter((a) => a.kind === "audio")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {String(a.meta?.filename ?? a.b2_key.split("/").pop())}
              </option>
            ))}
        </select>
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.wav,.flac,.mp3"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <button
        className="ws-btn"
        disabled={uploading !== null}
        onClick={() => fileRef.current?.click()}
      >
        {uploading === null
          ? "Upload reference audio"
          : `Uploading ${Math.round(uploading * 100)}%`}
      </button>
      <label>
        Exact words spoken in the reference
        <textarea
          className="av-text"
          rows={3}
          value={
            value.reference_text ??
            String(preset.api["2"].inputs.reference_text)
          }
          onChange={(e) => patch({ reference_text: e.target.value })}
        />
      </label>
      <span className="av-hint">
        Latvian uses Auto. Delivery comes from the reference recording. The
        pilot adapter needs listening review.
      </span>
      <label>
        Audio token limit{" "}
        <input
          type="number"
          min={32}
          max={4096}
          step={32}
          value={value.max_new_tokens ?? preset.api["2"].inputs.max_new_tokens}
          onChange={(e) => patch({ max_new_tokens: Number(e.target.value) })}
        />
      </label>
      {(
        [
          "trim_silence",
          "normalize_volume",
          "clarity_boost",
          "chorus_effect",
        ] as const
      ).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={Boolean(effects[key])}
            onChange={(e) => effect({ [key]: e.target.checked })}
          />
          {key.replaceAll("_", " ")}
        </label>
      ))}
      <label>
        Pitch (semitones){" "}
        <input
          type="number"
          min={-12}
          max={12}
          step={0.1}
          value={Number(effects.pitch_semitones)}
          onChange={(e) => effect({ pitch_semitones: Number(e.target.value) })}
        />
      </label>
      <label>
        Duration multiplier{" "}
        <input
          type="number"
          min={0.5}
          max={2}
          step={0.05}
          value={Number(effects.time_stretch)}
          onChange={(e) => effect({ time_stretch: Number(e.target.value) })}
        />
      </label>
      <span className="av-hint">
        1.2 slows the recording; 0.8 speeds it up. These effects run after
        speech generation.
      </span>
    </div>
  );
}
