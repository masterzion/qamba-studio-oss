import React, { useState } from "react";
import type { LocalStore } from "../../lib/localStore";
import { desktopRenderModels } from "../../lib/desktopPlanner";
import { enqueueJob } from "../../lib/db/jobs";
import StoryAssetPicker from "./StoryAssetPicker";
export default function StoryCandidatesPanel({
  store,
  unitId,
  entryId,
}: {
  store: LocalStore;
  unitId?: string;
  entryId?: string;
}) {
  const [model, setModel] = useState(""),
    [prompt, setPrompt] = useState(""),
    [count, setCount] = useState(2),
    [references, setReferences] = useState<string[]>([]),
    [candidate, setCandidate] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const unit = unitId ? store.find("production_units", unitId) : null,
    entry = entryId ? store.find("bible_entries", entryId) : null;
  return (
    <fieldset>
      <legend>
        {unit
          ? "Scene composition candidates"
          : "Historical reconstruction candidates"}
      </legend>
      <label>
        Installed image model key
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
      <label>
        Authored reconstruction or shot instructions
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label>
        Candidate count
        <input
          type="number"
          min={1}
          max={4}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      {!unit && (
        <label>
          Original registered image evidence
          <select
            multiple
            value={references}
            onChange={(e) =>
              setReferences(
                Array.from(e.target.selectedOptions).map((v) => v.value),
              )
            }
          >
            {store
              .rows("assets")
              .filter(
                (a) => ["image", "frame"].includes(a.kind) && !a.deleted_at,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.b2_key}
                </option>
              ))}
          </select>
        </label>
      )}
      <button
        onClick={async () => {
          try {
            if (
              !prompt.trim() ||
              !Number.isInteger(count) ||
              count < 1 ||
              count > 4
            )
              throw new Error("Enter explicit instructions and 1-4 candidates");
            if (
              unit &&
              (unit.status === "stale" ||
                store.find("story_graphs", unit.graph_id)?.revision !==
                  unit.graph_revision)
            )
              throw new Error("Capture current scene inputs");
            const refs = unit
              ? unit.context.canonicalSelections.flatMap((s: any) => s.assetIds)
              : references;
            const mode = refs.length ? "r2i" : "t2i",
              installed = (await desktopRenderModels()).find(
                (m) => m.kind === "image" && m.key === model,
              );
            if (!installed?.ready || !installed.modes.includes(mode))
              throw new Error(
                `Provision an image model supporting ${mode}: ${installed?.missing.join(", ") ?? model}`,
              );
            const requirements = unit
              ? {
                  scene: store.find("scenes", unit.scene_id),
                  beats: store
                    .rows("beats")
                    .filter((b) => b.scene_id === unit.scene_id),
                  visualSignature: unit.context.visualSignature,
                }
              : entry?.doc;
            for (let i = 0; i < count; i++)
              await enqueueJob({
                kind: "image_gen",
                lane: "local",
                project_id: store.projectId,
                payload: {
                  model_key: model,
                  mode,
                  prompt:
                    prompt +
                    "\nRequired captured specification: " +
                    JSON.stringify(requirements),
                  ref_asset_ids: refs,
                  seed: Math.floor(Math.random() * 2147483647),
                  width: 1280,
                  height: 720,
                  auto_accept: false,
                  story_strict: true,
                  story_workflow: unit ? "composition" : "reconstruction",
                  production_unit_id: unit?.id,
                  input_hash: unit?.context_hash,
                  sourceRefs:
                    unit?.context.historicalRefs ??
                    entry?.doc?.historical?.sourceRefs ??
                    [],
                  target: entry ? { bible_entry_id: entry.id } : undefined,
                },
              });
            setMessage(
              `${count} separate candidates queued; review identity, costume, placement, anatomy, props, period and action before use`,
            );
          } catch (e: any) {
            setMessage(e.message);
          }
        }}
      >
        Queue reviewed candidate plan
      </button>
      <StoryAssetPicker
        projectId={store.projectId}
        label="Candidate keyframe"
        value={candidate}
        onChange={setCandidate}
      />
      <p>
        Approval records a review. Attach approved reconstructions in Canonical
        assets. Add approved composition IDs to the next captured video context.
      </p>
      <p role="status">{message}</p>
    </fieldset>
  );
}
