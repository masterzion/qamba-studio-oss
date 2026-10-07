import React, { useState } from "react";
import { storyStore } from "../../lib/db/storyGraphs";
import { assetUrl } from "../../lib/db/assets";
import { invokeStrict } from "../../lib/desktop";
export default function StoryAssetPicker({
  projectId,
  label,
  value,
  onChange,
  subtitles = false,
}: {
  projectId: string;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  subtitles?: boolean;
}) {
  const store = storyStore(projectId),
    asset = value ? store.find("assets", value) : null,
    [message, setMessage] = useState("");
  const assets = store
    .rows("assets")
    .filter(
      (a) =>
        !a.deleted_at &&
        (subtitles
          ? a.content_type === "text/vtt"
          : ["image", "frame"].includes(a.kind)),
    );
  return (
    <fieldset>
      <legend>{label}</legend>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">None</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.b2_key}
          </option>
        ))}
      </select>
      {asset && !subtitles && (
        <img
          alt={label}
          src={assetUrl(asset as any) ?? undefined}
          style={{ maxWidth: "100%", maxHeight: 200 }}
        />
      )}
      <button
        disabled={!asset}
        onClick={async () => {
          try {
            if (subtitles) {
              const url = assetUrl(asset as any);
              if (!url) throw new Error("Subtitle source is unavailable");
              const response = await fetch(url);
              if (!response.ok) throw new Error("Cannot read subtitles");
              const text = await response.text();
              if (!text.startsWith("WEBVTT"))
                throw new Error("Expected a WEBVTT subtitle file");
              window.alert(text.slice(0, 12000));
            }
            const note = window.prompt(
              `Record your visual or text review of ${label}`,
            );
            if (!note?.trim()) return;
            const proof: any = await invokeStrict("story_media_probe", {
              projectId,
              key: asset!.b2_key,
            });
            store.mediaReview(() =>
              store.update("assets", [asset!], {
                meta: {
                  ...asset!.meta,
                  presentation: true,
                  review: {
                    status: "approved",
                    note,
                    mediaHash: proof.sha256,
                    probe: proof,
                    reviewedAt: new Date().toISOString(),
                  },
                },
              }),
            );
            setMessage("Review and file hash recorded");
          } catch (e: any) {
            setMessage(e.message);
          }
        }}
      >
        Review {label}
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
