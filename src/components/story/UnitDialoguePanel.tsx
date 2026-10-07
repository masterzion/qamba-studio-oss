import React, { useState } from "react";
import type { LocalStore } from "../../lib/localStore";
import { localProfileFor } from "../../lib/localProviderProfiles";
import { normalizeDialogue } from "../../lib/storyDialogue";
import { lipSyncPayload } from "../../lib/lipSyncProviders";
import { enqueueJob } from "../../lib/db/jobs";
import { assetUrl } from "../../lib/db/assets";
import { invokeStrict } from "../../lib/desktop";
export default function UnitDialoguePanel({
  store,
  unitId,
}: {
  store: LocalStore;
  unitId: string;
}) {
  const [speaker, setSpeaker] = useState(""),
    [lineId, setLineId] = useState<string | undefined>(),
    [delivery, setDelivery] = useState(""),
    [text, setText] = useState(""),
    [emotion, setEmotion] = useState("neutral"),
    [intensity, setIntensity] = useState(0),
    [pace, setPace] = useState(1),
    [audio, setAudio] = useState(""),
    [video, setVideo] = useState(""),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(4000),
    [models, setModels] = useState("[]"),
    [note, setNote] = useState(""),
    [message, setMessage] = useState("");
  const unit = store.find("production_units", unitId),
    roots = store
      .rows("bible_entries")
      .filter(
        (e) =>
          e.doc?.canonical?.approval === "approved" &&
          e.doc.canonical.rootEntryId === e.id &&
          e.doc.canonical.entityKind === "character",
      );
  const act = async (fn: () => Promise<void>) => {
    try {
      if (!unit || unit.status === "stale")
        throw new Error("Capture a current production unit");
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const selected = store.find("assets", audio);
  return (
    <fieldset>
      <legend>Exact dialogue and lip-sync</legend>
      {unit?.context.productionSettings.storyContent && (
        <label>
          Scene dialogue line
          <select
            value={lineId ?? ""}
            onChange={(e) => {
              const line =
                unit.context.productionSettings.storyContent.dialogue.find(
                  (l: any) => l.id === e.target.value,
                );
              if (line) {
                setLineId(line.id);
                setText(line.line);
                setSpeaker(line.speaker_id ?? "");
                setDelivery(line.delivery ?? "");
                setEmotion(line.emotion);
                setIntensity(line.intensity);
                setPace(line.pace);
              }
            }}
          >
            <option value="">Choose authored dialogue…</option>
            {unit.context.productionSettings.storyContent.dialogue.map(
              (l: any) => (
                <option key={l.id} value={l.id}>
                  {l.line}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      <label>
        Canonical speaker / narrator reference voice
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="">Choose approved root identity…</option>
          {roots.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Exact dialogue ·{" "}
        {String(unit?.context.productionSettings.language ?? "lv")}
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label>
        Emotion
        <input value={emotion} onChange={(e) => setEmotion(e.target.value)} />
      </label>
      <label>
        Intensity (0–1)
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
        />
      </label>
      <label>
        Pace
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={pace}
          onChange={(e) => setPace(Number(e.target.value))}
        />
      </label>
      <button
        onClick={() =>
          act(async () => {
            const profile = localProfileFor("tts");
            if (!profile)
              throw new Error(
                "Configure a provisioned local TTS profile first",
              );
            const line = normalizeDialogue({
              id: lineId,
              delivery,
              speaker_id: lineId
                ? (unit?.context.productionSettings.storyContent?.dialogue.find(
                    (l: any) => l.id === lineId,
                  )?.speaker_id ?? null)
                : speaker,
              line: text,
              language: String(
                unit?.context.productionSettings.language ?? "lv",
              ),
              emotion,
              intensity,
              pace,
            });
            await enqueueJob({
              kind: "story_dialogue",
              lane: "local",
              project_id: store.projectId,
              payload: {
                voice_root_id: speaker,
                line,
                profile,
                production_unit_id: unitId,
                input_hash: unit!.context_hash,
              },
            });
            setMessage(
              "Exact dialogue queued; verify pronunciation, delivery and complete words by listening",
            );
          })
        }
      >
        Generate exact dialogue
      </button>
      <label>
        Final dialogue
        <select value={audio} onChange={(e) => setAudio(e.target.value)}>
          <option value="">Choose audio…</option>
          {store
            .rows("assets")
            .filter((a) => a.kind === "audio")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.b2_key}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <audio controls src={assetUrl(selected as any) ?? undefined} />
      )}
      <label>
        Listening review note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        onClick={() =>
          act(async () => {
            if (!selected || !note.trim())
              throw new Error(
                "Listen to the final audio and record the review",
              );
            const proof: any = await invokeStrict("story_media_probe", {
              projectId: store.projectId,
              key: selected.b2_key,
            });
            if (!proof.hasAudio || !proof.durationMs)
              throw new Error("No measured audio stream");
            store.mediaReview(() =>
              store.update("assets", [selected], {
                duration_ms: proof.durationMs,
                meta: {
                  ...selected.meta,
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
            setMessage("Listening review and exact audio hash recorded");
          })
        }
      >
        Approve final dialogue
      </button>
      <label>
        Reviewed video segment source
        <select value={video} onChange={(e) => setVideo(e.target.value)}>
          <option value="">Choose approved unit video…</option>
          {store
            .rows("assets")
            .filter(
              (a) =>
                a.kind === "video" &&
                a.meta?.production_unit_id === unitId &&
                a.meta?.review?.status === "approved",
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.b2_key}
              </option>
            ))}
        </select>
      </label>
      <label>
        Segment start (ms)
        <input
          type="number"
          value={start}
          onChange={(e) => setStart(Number(e.target.value))}
        />
      </label>
      <label>
        Segment end (ms)
        <input
          type="number"
          value={end}
          onChange={(e) => setEnd(Number(e.target.value))}
        />
      </label>
      <label>
        Provisioned model files: JSON array of path and sha256
        <textarea value={models} onChange={(e) => setModels(e.target.value)} />
      </label>
      <button
        onClick={() =>
          act(async () => {
            if (selected?.meta?.review?.status !== "approved")
              throw new Error("Approve the exact dialogue first");
            const payload = lipSyncPayload({
              videoAssetId: video,
              dialogueAssetId: audio,
              speakerRootId: speaker,
              startMs: start,
              endMs: end,
              productionUnitId: unitId,
              inputHash: unit!.context_hash,
              modelFiles: JSON.parse(models),
            });
            await enqueueJob({
              kind: "lip_sync",
              lane: "local",
              project_id: store.projectId,
              payload,
            });
            setMessage(
              "Lip-sync queued; missing local nodes or weights will block execution",
            );
          })
        }
      >
        Lip-sync reviewed segment
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
