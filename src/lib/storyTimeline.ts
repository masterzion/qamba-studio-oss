import type { LocalStore } from "./localStore.ts";
import { duckingEnvelope } from "./storyDialogue.ts";
export function ensureUnitTimeline(store: LocalStore, unitId: string) {
  const unit = store.find("production_units", unitId),
    board = unit && store.find("storyboards", unit.storyboard_id);
  if (!unit || !board) throw new Error("Production unit is missing");
  const existing = store
    .rows("timelines")
    .find((t) => t.production_unit_id === unitId);
  if (existing) return existing;
  return store.command(() => {
    const timeline = store.insert("timelines", [
      {
        episode_id: board.episode_id,
        production_unit_id: unitId,
        name: `Scene ${unitId.slice(0, 8)}`,
        fps: 24,
        width: 1280,
        height: 720,
      },
    ])[0];
    store.insert("tracks", [
      { timeline_id: timeline.id, kind: "video", idx: 0, name: "V1" },
      { timeline_id: timeline.id, kind: "audio", idx: 0, name: "Dialogue" },
      { timeline_id: timeline.id, kind: "audio", idx: 1, name: "Music" },
      { timeline_id: timeline.id, kind: "audio", idx: 2, name: "Ambience" },
      { timeline_id: timeline.id, kind: "audio", idx: 3, name: "SFX" },
    ]);
    return timeline;
  });
}
export function applyDialogueDucking(
  store: LocalStore,
  musicTrackId: string,
  dialogueTrackId: string,
  durationMs: number,
  db = -12,
) {
  const music = store.find("tracks", musicTrackId),
    dialogue = store.find("tracks", dialogueTrackId);
  if (
    !music ||
    !dialogue ||
    music.timeline_id !== dialogue.timeline_id ||
    music.id === dialogue.id
  )
    throw new Error(
      "Music and dialogue must be separate lanes of the same cut",
    );
  const speech = store
    .rows("clips")
    .filter((c) => c.track_id === dialogueTrackId)
    .map((c) => ({
      startMs: c.t_start_ms,
      endMs: c.t_start_ms + c.duration_ms,
    }));
  const automation = duckingEnvelope(speech, durationMs, db).map((p) => ({
    t_ms: p.t_ms,
    gain_db: p.db + (music.gain_db ?? 0),
  }));
  store.update("tracks", [music], {
    automation,
    duck_under_track_id: dialogueTrackId,
  });
  return automation;
}
