import React, { useState } from "react";
import { storyStore } from "../../lib/db/storyGraphs";
import { useLiveQuery } from "../../hooks/useLiveQuery";
import ConditionEditor from "./ConditionEditor";
import type { Condition } from "../../lib/storyTypes";
import { invokeStrict } from "../../lib/desktop";
import StoryCandidatesPanel from "./StoryCandidatesPanel";
export default function CanonicalAssetsPanel({
  projectId,
}: {
  projectId: string;
}) {
  const store = storyStore(projectId),
    { data } = useLiveQuery(
      async () => ({
        entries: structuredClone(store.rows("bible_entries")),
        assets: structuredClone(store.rows("assets")),
      }),
      ["bible_entries", "assets", "bible_assets"],
      [projectId],
    );
  const [entryId, setEntryId] = useState(""),
    [assetId, setAssetId] = useState(""),
    [orientation, setOrientation] = useState("front"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const [graphId, setGraphId] = useState(""),
    [variantId, setVariantId] = useState(""),
    [when, setWhen] = useState<Condition>(null),
    [period, setPeriod] = useState("");
  const graphs = store.rows("story_graphs"),
    graph = graphs.find((g) => g.id === graphId);
  const entry = data?.entries.find((e) => e.id === entryId);
  const act = async (fn: () => unknown | Promise<unknown>) => {
    try {
      await fn();
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="story-panel">
      <h2>Canonical identities and approved plates</h2>
      <select
        aria-label="Canonical entity"
        value={entryId}
        onChange={(e) => setEntryId(e.target.value)}
      >
        <option value="">Choose an existing Bible entity…</option>
        {data?.entries
          .filter((e) => ["character", "location", "prop"].includes(e.kind))
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.doc?.variant_of ? "variant" : "root"}
            </option>
          ))}
      </select>
      {entry && (
        <>
          <StoryCandidatesPanel store={store} entryId={entry.id} />
          <p>
            {entry.doc?.canonical
              ? `${entry.doc.canonical.entityKind} · revision ${entry.doc.canonical.revision} · ${entry.doc.canonical.approval}`
              : "Canonical metadata has not been established"}
          </p>
          <button
            onClick={() =>
              act(() => {
                let root = entry;
                const seen = new Set();
                while (root.doc?.variant_of) {
                  if (seen.has(root.id))
                    throw new Error("Variant ancestry cycle");
                  seen.add(root.id);
                  root = store.find("bible_entries", root.doc.variant_of)!;
                  if (!root) throw new Error("Missing variant parent");
                }
                store.update("bible_entries", [entry], {
                  doc: {
                    ...entry.doc,
                    canonical: {
                      entityKind: entry.kind,
                      rootEntryId: root.id,
                      revision: (entry.doc?.canonical?.revision ?? 0) + 1,
                      approval: "draft",
                      sourceRefs: entry.doc?.sourceRefs ?? [],
                      historicalPeriod: "",
                      variantRules: entry.doc?.canonical?.variantRules ?? [],
                    },
                  },
                });
              })
            }
          >
            Establish / revise canonical record
          </button>
          <label>
            Review note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button
            disabled={!entry.doc?.canonical || !note.trim()}
            onClick={() =>
              act(() =>
                store.mediaReview(() =>
                  store.update("bible_entries", [entry], {
                    doc: {
                      ...entry.doc,
                      canonical: {
                        ...entry.doc.canonical,
                        approval: "approved",
                        review: { note, reviewedAt: new Date().toISOString() },
                      },
                    },
                  }),
                ),
              )
            }
          >
            Approve canonical identity
          </button>
          <h3>Attach an original or generated plate</h3>
          <label>
            Historical period
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder={entry.doc?.canonical?.historicalPeriod ?? ""}
            />
          </label>
          <button
            onClick={() =>
              act(() =>
                store.update("bible_entries", [entry], {
                  doc: {
                    ...entry.doc,
                    canonical: {
                      ...entry.doc.canonical,
                      historicalPeriod: period,
                      approval: "draft",
                      revision: (entry.doc?.canonical?.revision ?? 0) + 1,
                    },
                  },
                }),
              )
            }
          >
            Revise period for review
          </button>
          {entry.doc?.canonical?.rootEntryId === entry.id && (
            <fieldset>
              <legend>State-selected costume or injury variant</legend>
              <select
                aria-label="Variant story"
                value={graphId}
                onChange={(e) => setGraphId(e.target.value)}
              >
                <option value="">Choose story state definitions…</option>
                {graphs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Canonical state variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">Choose variant…</option>
                {data?.entries
                  .filter(
                    (v) =>
                      v.id !== entry.id &&
                      v.doc?.canonical?.rootEntryId === entry.id,
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
              {graph && (
                <ConditionEditor
                  definitions={graph.document.stateDefinitions}
                  value={when}
                  onChange={setWhen}
                />
              )}
              <button
                disabled={!graph || !variantId}
                onClick={() =>
                  act(() =>
                    store.update("bible_entries", [entry], {
                      doc: {
                        ...entry.doc,
                        canonical: {
                          ...entry.doc.canonical,
                          approval: "draft",
                          revision: entry.doc.canonical.revision + 1,
                          variantRules: [
                            ...(entry.doc.canonical.variantRules ?? []),
                            {
                              graphId,
                              condition: when,
                              variantEntryId: variantId,
                            },
                          ],
                        },
                      },
                    }),
                  )
                }
              >
                Add variant rule for review
              </button>
              <pre>
                {JSON.stringify(
                  entry.doc?.canonical?.variantRules ?? [],
                  null,
                  2,
                )}
              </pre>
            </fieldset>
          )}
          <select
            aria-label="Canonical plate"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            <option value="">Choose image…</option>
            {data?.assets
              .filter(
                (a) => ["image", "frame"].includes(a.kind) && !a.deleted_at,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.b2_key}
                </option>
              ))}
          </select>
          <select
            aria-label="Plate orientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value)}
          >
            {["front", "rear", "left", "right", "wide", "detail"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <button
            disabled={!assetId || !note.trim()}
            onClick={() =>
              act(async () => {
                const asset = store.find("assets", assetId)!;
                const proof: any = await invokeStrict("story_media_probe", {
                  projectId,
                  key: asset.b2_key,
                });
                if (!proof.width || !proof.height)
                  throw new Error(
                    "The canonical plate has no verified image stream",
                  );
                store.mediaReview(() => {
                  store.update("assets", [asset], {
                    meta: {
                      ...asset.meta,
                      canonicalPlate: {
                        orientation,
                        entryId,
                        revision: entry.doc?.canonical?.revision ?? 1,
                      },
                      sourceRefs: entry.doc?.canonical?.sourceRefs ?? [],
                      review: {
                        mediaHash: proof.sha256,
                        probe: proof,
                        status: "approved",
                        note,
                        reviewedAt: new Date().toISOString(),
                      },
                    },
                  });
                  store.insert("bible_assets", [
                    {
                      entry_id: entryId,
                      asset_id: assetId,
                      role: entry.kind === "location" ? "master" : "ref",
                      slot: store
                        .rows("bible_assets")
                        .filter((r) => r.entry_id === entryId).length,
                    },
                  ]);
                });
              })
            }
          >
            Approve and attach plate
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        Generated candidates stay pending review. Costume and injury variants
        retain their existing root identity and voice inheritance.
      </p>
    </section>
  );
}
