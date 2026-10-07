import React, { useState } from "react";
import { invokeStrict } from "../../lib/desktop";
import {
  captureProductionContext,
  createProductionUnit,
  approveProductionUnit,
} from "../../lib/productionContext";
import { storyStore } from "../../lib/db/storyGraphs";
import { enqueueJob } from "../../lib/db/jobs";
import type { StoryGraph, StorySession, Condition } from "../../lib/storyTypes";
import ConditionEditor from "./ConditionEditor";
import UnitCutPanel from "./UnitCutPanel";
import UnitDialoguePanel from "./UnitDialoguePanel";
import UnitVisionReview from "./UnitVisionReview";
import StoryCandidatesPanel from "./StoryCandidatesPanel";
import StorySubtitlePanel from "./StorySubtitlePanel";
export default function ProductionPlanPanel({
  graph,
  session,
  initialLanguage = graph.document.defaultLanguage,
}: {
  graph: StoryGraph;
  session: StorySession;
  initialLanguage?: string;
}) {
  const store = storyStore(graph.project_id),
    node = graph.document.nodes.find((n) => n.id === session.currentNodeId);
  const [message, setMessage] = useState(""),
    [language, setLanguage] = useState(initialLanguage),
    [model, setModel] = useState(""),
    [when, setWhen] = useState<Condition>({
      path: "flags.injured",
      operator: "eq",
      value: Boolean(session.state.flags?.injured),
    }),
    [selected, setSelected] = useState<string[]>([]),
    [unitId, setUnitId] = useState(""),
    [assetId, setAssetId] = useState(""),
    [note, setNote] = useState("");
  const [compositionIds, setCompositionIds] = useState("");
  const [videoMode, setVideoMode] = useState("r2v");
  const entities = store
    .rows("bible_entries")
    .filter((e) => e.doc?.canonical?.approval === "approved");
  const capture = async () => {
    if (!model.trim()) throw new Error("Choose an installed desktop model key");
    const selections = selected.map((id) => {
      const e = entities.find((e) => e.id === id)!;
      return {
        rootEntryId: e.doc.canonical.rootEntryId,
        variantEntryId: e.id,
        revision: e.doc.canonical.revision,
        assetIds: store
          .rows("bible_assets")
          .filter(
            (a) =>
              a.entry_id === id &&
              store.find("assets", a.asset_id)?.meta?.review?.status ===
                "approved",
          )
          .map((a) => a.asset_id),
      };
    });
    const context = await captureProductionContext(
      store,
      graph,
      session.edgeHistory,
      {
        visualSignature: {},
        canonicalSelections: selections,
        productionSettings: {
          language,
          model_key: model,
          presentationWhen: when,
          targetSegmentMs: 4000,
          compositionAssetIds: compositionIds
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          videoMode,
        },
      },
    );
    const unit = createProductionUnit(store, context);
    setUnitId(unit.id);
    setMessage(`Captured unit ${unit.id}. Review inputs before queueing.`);
  };
  const act = async (fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  if (node?.type !== "scene") return null;
  return (
    <fieldset className="story-panel">
      <legend>Production for this simulated scene</legend>
      {graph.document.schemaVersion === 2 && (
        <label>
          Speech language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {graph.document.languages?.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Installed video model key
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Exact desktop model-map key"
        />
      </label>
      <h4>Approved canonical inputs</h4>
      {entities.map((e) => (
        <label key={e.id}>
          <input
            type="checkbox"
            checked={selected.includes(e.id)}
            onChange={(event) =>
              setSelected((v) =>
                event.target.checked
                  ? [...v, e.id]
                  : v.filter((id) => id !== e.id),
              )
            }
          />
          {e.name}
        </label>
      ))}
      <label>
        Existing captured unit
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Capture or select a unit…</option>
          {store
            .rows("production_units")
            .filter((u) => u.graph_id === graph.id && u.node_id === node.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.id.slice(0, 8)} · {u.status}
              </option>
            ))}
        </select>
      </label>
      <label>
        Approved composition asset IDs (comma separated)
        <input
          value={compositionIds}
          onChange={(e) => setCompositionIds(e.target.value)}
        />
      </label>
      <h4>Export presentation rule</h4>
      <label>
        Video conditioning mode
        <select
          value={videoMode}
          onChange={(e) => setVideoMode(e.target.value)}
        >
          <option value="r2v">Approved references (r2v)</option>
          <option value="flf">
            First/last frames (one-shot scene, two ordered compositions)
          </option>
        </select>
      </label>
      <ConditionEditor
        value={when}
        definitions={graph.document.stateDefinitions}
        onChange={setWhen}
      />
      <button onClick={() => act(capture)}>Capture production inputs</button>
      {unitId && (
        <>
          <UnitCutPanel store={store} unitId={unitId} />
          <UnitDialoguePanel store={store} unitId={unitId} />
          {node.content && <StorySubtitlePanel store={store} unitId={unitId} />}
          <UnitVisionReview store={store} unitId={unitId} />
          <StoryCandidatesPanel store={store} unitId={unitId} />
          <button
            onClick={() =>
              act(async () => {
                const unit = store.find("production_units", unitId)!;
                const { queueUnitRender } =
                  await import("../../lib/storyProduction");
                await queueUnitRender(store, unit, enqueueJob);
                setMessage("Unit render queued; output requires human review");
              })
            }
          >
            Queue reviewed unit render
          </button>
          <label>
            Reviewed final media
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Choose unit output…</option>
              {store
                .rows("assets")
                .filter((a) => a.meta?.production_unit_id === unitId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.b2_key}
                  </option>
                ))}
            </select>
          </label>
          <textarea
            aria-label="Playback review note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            onClick={() =>
              act(async () => {
                const asset = store.find("assets", assetId);
                if (!asset) throw new Error("Choose a final unit output");
                const proof = await invokeStrict<any>("story_media_probe", {
                  projectId: graph.project_id,
                  key: asset.b2_key,
                });
                approveProductionUnit(store, unitId, assetId, note, proof);
                setMessage("Playback approval recorded");
              })
            }
          >
            Approve final scene output
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </fieldset>
  );
}
