import React, { useState, useEffect } from "react";
import type { LocalStore } from "../../lib/localStore";
import {
  cuesFromMeasuredCut,
  reviewSubtitles,
  registerStorySubtitleAssets,
  type SubtitleCue,
} from "../../lib/storySubtitles";
export default function StorySubtitlePanel({
  store,
  unitId,
}: {
  store: LocalStore;
  unitId: string;
}) {
  const unit = store.find("production_units", unitId),
    graph = unit && store.find("story_graphs", unit.graph_id),
    node = graph?.document.nodes.find((n: any) => n.id === unit?.node_id);
  const lines = node?.content?.dialogue ?? [],
    language =
      unit?.context?.productionSettings?.language ??
      graph?.document.defaultLanguage;
  const initial = () =>
    structuredClone(unit?.subtitle_document?.cues ?? []) as SubtitleCue[];
  const [cues, setCues] = useState<SubtitleCue[]>(initial),
    [note, setNote] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setCues(initial());
    setNote("");
    setMessage("");
  }, [unitId]);
  const patch = (id: string, value: Partial<SubtitleCue>) =>
    setCues(cues.map((c) => (c.id === id ? { ...c, ...value } : c)));
  return (
    <fieldset>
      <legend>Measured subtitles for all translations</legend>
      <p>
        Video duration:{" "}
        {store.find("assets", unit?.approved_asset_id)?.duration_ms ??
          "Approve final video first"}{" "}
        ms. Timings use the same dialogue IDs in every subtitle language.
      </p>
      <button
        onClick={() => {
          try {
            setCues(cuesFromMeasuredCut(store, unitId));
            setMessage(
              "Timings copied from dialogue clips. Review against the final video.",
            );
          } catch (e: any) {
            setMessage(e.message);
          }
        }}
      >
        Read timings from dialogue cut
      </button>
      {cues.map((cue, i) => (
        <fieldset key={cue.id}>
          <legend>Subtitle {i + 1}</legend>
          <label>
            Dialogue line
            <select
              value={cue.lineId}
              onChange={(e) => patch(cue.id, { lineId: e.target.value })}
            >
              {lines.map((line: any) => (
                <option key={line.id} value={line.id}>
                  {line.text[language] ?? line.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start (milliseconds)
            <input
              type="number"
              min={0}
              step={1}
              value={cue.startMs}
              onChange={(e) =>
                patch(cue.id, { startMs: Number(e.target.value) })
              }
            />
          </label>
          <label>
            End (milliseconds)
            <input
              type="number"
              min={0}
              step={1}
              value={cue.endMs}
              onChange={(e) => patch(cue.id, { endMs: Number(e.target.value) })}
            />
          </label>
          <button onClick={() => setCues(cues.filter((c) => c.id !== cue.id))}>
            Remove subtitle cue
          </button>
        </fieldset>
      ))}
      <button
        disabled={!lines.length}
        onClick={() => {
          const line =
            lines.find((l: any) => !cues.some((c) => c.lineId === l.id)) ??
            lines[0];
          setCues([
            ...cues,
            {
              id: crypto.randomUUID(),
              lineId: line.id,
              startMs: cues.at(-1)?.endMs ?? 0,
              endMs: (cues.at(-1)?.endMs ?? 0) + 1000,
            },
          ]);
        }}
      >
        Add subtitle cue
      </button>
      <label>
        Subtitle review note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        onClick={async () => {
          try {
            await reviewSubtitles(store, unitId, cues, note);
            const { writeLocalMedia } = await import("../../lib/localPlane");
            await registerStorySubtitleAssets(
              store,
              unitId,
              (key, text, type) =>
                writeLocalMedia(
                  store.projectId,
                  key,
                  new Blob([text], { type }),
                ).then(() => {}),
            );
            setMessage("Subtitle timing review saved");
          } catch (e: any) {
            setMessage(e.message);
          }
        }}
      >
        Approve subtitle timings
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
