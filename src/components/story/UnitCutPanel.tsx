import React, { useState } from "react";
import type { LocalStore } from "../../lib/localStore";
import {
  ensureUnitTimeline,
  applyDialogueDucking,
} from "../../lib/storyTimeline";
import { syncBlocksToTimeline } from "../../lib/db/timeline";
import { enqueueJob } from "../../lib/db/jobs";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";

export default function UnitCutPanel({
  store,
  unitId,
}: {
  store: LocalStore;
  unitId: string;
}) {
  const [message, setMessage] = useState(""),
    [assetId, setAssetId] = useState(""),
    [lane, setLane] = useState("Dialogue"),
    [start, setStart] = useState(0);
  const unit = store.find("production_units", unitId);
  const act = async (fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const current = () => {
    if (
      !unit ||
      unit.status === "stale" ||
      store.find("story_graphs", unit.graph_id)?.revision !==
        unit.graph_revision
    )
      throw new Error("Capture current scene inputs first");
    return ensureUnitTimeline(store, unitId);
  };
  return (
    <fieldset>
      <legend>Scene cut and audio</legend>
      <button
        onClick={() =>
          useWorkspaceStore.getState().openModal({
            kind: "scene",
            sceneId: unit!.scene_id,
            productionUnitId: unitId,
          })
        }
      >
        Review unit shots and takes
      </button>
      <button
        onClick={() =>
          act(async () => {
            const timeline = current();
            await syncBlocksToTimeline(timeline.id, unit!.storyboard_id);
            const videoTracks = new Set(
              store
                .rows("tracks")
                .filter(
                  (t) => t.timeline_id === timeline.id && t.kind === "video",
                )
                .map((t) => t.id),
            );
            store.update(
              "clips",
              store.rows("clips").filter((c) => videoTracks.has(c.track_id)),
              { audio_detached: true },
            );
            setMessage("Kept unit takes synchronized to the scene cut");
          })
        }
      >
        Build cut from kept unit takes
      </button>
      <label>
        Audio stem
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">Select measured audio…</option>
          {store
            .rows("assets")
            .filter((a) => a.kind === "audio" && a.duration_ms > 0)
            .map((a) => (
              <option value={a.id} key={a.id}>
                {a.b2_key}
              </option>
            ))}
        </select>
      </label>
      <label>
        Lane
        <select value={lane} onChange={(e) => setLane(e.target.value)}>
          {["Dialogue", "Music", "Ambience", "SFX"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Start (milliseconds)
        <input
          type="number"
          min={0}
          value={start}
          onChange={(e) => setStart(Number(e.target.value))}
        />
      </label>
      <button
        onClick={() =>
          act(() => {
            const timeline = current(),
              asset = store.find("assets", assetId),
              track = store
                .rows("tracks")
                .find((t) => t.timeline_id === timeline.id && t.name === lane);
            if (!asset || !track || !Number.isInteger(start) || start < 0)
              throw new Error("Select a measured audio stem and a valid start");
            store.command(() => {
              store.insert("clips", [
                {
                  track_id: track.id,
                  asset_id: asset.id,
                  t_start_ms: start,
                  duration_ms: asset.duration_ms,
                  in_ms: 0,
                  label: lane,
                },
              ]);
              store.update("timelines", [timeline], { render_stale: true });
            });
            setMessage(`${lane} stem added to this scene cut`);
          })
        }
      >
        Add stem
      </button>
      <button
        onClick={() =>
          act(() => {
            const timeline = current(),
              tracks = store
                .rows("tracks")
                .filter((t) => t.timeline_id === timeline.id),
              music = tracks.find((t) => t.name === "Music"),
              dialogue = tracks.find((t) => t.name === "Dialogue");
            const trackIds = new Set(tracks.map((t) => t.id));
            const duration = Math.max(
              0,
              ...store
                .rows("clips")
                .filter((c) => trackIds.has(c.track_id))
                .map((c) => c.t_start_ms + c.duration_ms),
            );
            if (!duration) throw new Error("Add scene clips first");
            applyDialogueDucking(store, music!.id, dialogue!.id, duration);
            setMessage("Music automation ducks 12 dB under dialogue");
          })
        }
      >
        Duck music under dialogue
      </button>
      <button
        onClick={() =>
          act(async () => {
            const timeline = current();
            await enqueueJob({
              kind: "tl_render",
              lane: "local",
              project_id: store.projectId,
              episode_id: timeline.episode_id,
              payload: {
                timeline_id: timeline.id,
                input_hash: unit!.context_hash,
                master_profile: { targetLufs: -16, truePeakDb: -1 },
                output: { format: "h264", audio: "aac" },
              },
            });
            setMessage(
              "Final scene mix queued; listen to the output before approving it",
            );
          })
        }
      >
        Render mastered scene
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
