import test from "node:test";
import assert from "node:assert/strict";
import { fixtureStore, paths } from "./storyTestFixture.ts";
import {
  captureProductionContext,
  createProductionUnit,
  approveProductionUnit,
} from "./productionContext.ts";
import { saveGraphInStore } from "./storyPersistence.ts";
import {
  correctHistoricalRecord,
  searchHistoricalSources,
  type HistoricalRecord,
} from "./historicalBible.ts";
import {
  normalizeDialogue,
  dialogueCacheKey,
  duckingEnvelope,
  checkDialogueCapability,
} from "./storyDialogue.ts";
import { gainAtMs } from "./mix.ts";
import { validateLocalEndpoint } from "./localProviderProfiles.ts";
import { prepareStoryExport } from "./storyExport.ts";
import { runStoryTool, applyStoryProposal } from "./storyTools.ts";
import { startSession, stepSession } from "../../director/story_runtime.js";
const input = {
  visualSignature: {},
  canonicalSelections: [],
  productionSettings: {
    model_key: "test",
    presentationWhen: { path: "flags.injured", operator: "eq", value: false },
  },
};
test("export covers both reconvergent variants and rejects overlapping presentations", async () => {
  const { store, graph } = fixtureStore();
  const seen = new Set<string>();
  for (const path of paths) {
    let session = startSession(graph);
    for (let i = 0; i <= path.edgeIds.length; i++) {
      const node = graph.document.nodes.find(
        (n) => n.id === session.currentNodeId,
      )!;
      if (node.type === "scene") {
        const injured = Boolean(session.state.flags.injured),
          key = node.id + injured;
        if (!seen.has(key)) {
          seen.add(key);
          const context = await captureProductionContext(
            store,
            graph,
            session.edgeHistory,
            {
              ...input,
              productionSettings: {
                ...input.productionSettings,
                presentationWhen: {
                  path: "flags.injured",
                  operator: "eq",
                  value: injured,
                },
              },
            },
          );
          const unit = createProductionUnit(store, context);
          const asset = store.insert("assets", [
            {
              project_id: store.projectId,
              b2_key: `${key}.mp4`,
              kind: "video",
              meta: {
                production_unit_id: unit.id,
                input_hash: unit.context_hash,
              },
            },
          ])[0];
          approveProductionUnit(
            store,
            unit.id,
            asset.id,
            "Synthetic test approval",
            {
              sha256: "b".repeat(64),
              durationMs: 4000,
              width: 320,
              height: 180,
              fps: 24,
              hasAudio: true,
            },
          );
        }
      }
      if (i < path.edgeIds.length)
        session = stepSession(graph, session, path.edgeIds[i]);
    }
  }
  const spec = await prepareStoryExport(store, graph);
  assert.equal(spec.media.length, 5);
  const sceneFile = JSON.parse(
    spec.files.find((f) => f.path === "scenes.json")!.text,
  );
  assert.equal(
    sceneFile.find((s: any) => s.variants.length === 2).variants.length,
    2,
  );
  assert.equal(
    JSON.parse(
      spec.files.find((f) => f.path === "runtime/conformance.json")!.text,
    ).cases.length,
    2,
  );
  const first = store.rows("production_units")[0];
  store.mediaReview(() =>
    store.insert("production_units", [{ ...first, id: crypto.randomUUID() }]),
  );
  await assert.rejects(
    () => prepareStoryExport(store, graph),
    /2 matching presentations/,
  );
});
test("reconvergent paths share a scene UUID and preserve distinct production inputs", async () => {
  const { store, graph } = fixtureStore();
  const hide = await captureProductionContext(
      store,
      graph,
      paths[0].edgeIds.slice(0, 3),
      input,
    ),
    run = await captureProductionContext(
      store,
      graph,
      paths[1].edgeIds.slice(0, 3),
      input,
    );
  assert.equal(hide.sceneId, run.sceneId);
  assert.notEqual(hide.inputHash, run.inputHash);
  assert.notEqual(hide.stateHash, run.stateHash);
  const a = createProductionUnit(store, hide),
    b = createProductionUnit(store, run);
  assert.notEqual(a.id, b.id);
  assert.equal(createProductionUnit(store, hide).id, a.id);
});
test("unit indices are isolated; raw approval and context replacement are refused", async () => {
  const { store, graph, board } = fixtureStore();
  const a = createProductionUnit(
      store,
      await captureProductionContext(
        store,
        graph,
        paths[0].edgeIds.slice(0, 3),
        input,
      ),
    ),
    b = createProductionUnit(
      store,
      await captureProductionContext(
        store,
        graph,
        paths[1].edgeIds.slice(0, 3),
        input,
      ),
    );
  store.insert("generation_blocks", [
    {
      storyboard_id: board.id,
      production_unit_id: a.id,
      idx: 0,
      scene_ids: [a.scene_id],
    },
  ]);
  store.insert("generation_blocks", [
    {
      storyboard_id: board.id,
      production_unit_id: b.id,
      idx: 0,
      scene_ids: [b.scene_id],
    },
  ]);
  assert.throws(
    () =>
      store.insert("generation_blocks", [
        {
          storyboard_id: board.id,
          production_unit_id: a.id,
          idx: 0,
          scene_ids: [a.scene_id],
        },
      ]),
    { code: "STORY_BLOCK_INDEX" },
  );
  assert.throws(
    () => store.update("production_units", [a], { status: "approved" }),
    { code: "STORY_HUMAN_APPROVAL" },
  );
  assert.throws(
    () =>
      store.update("production_units", [a], {
        context: { ...a.context, visualSignature: { wrong: true } },
      }),
    { code: "STORY_CONTEXT_IMMUTABLE" },
  );
});
test("human approval is atomic; semantic edits stale units and layout edits preserve them", async () => {
  const { store, graph } = fixtureStore();
  const unit = createProductionUnit(
    store,
    await captureProductionContext(
      store,
      graph,
      paths[0].edgeIds.slice(0, 3),
      input,
    ),
  );
  const asset = store.insert("assets", [
    {
      project_id: store.projectId,
      b2_key: "test.mp4",
      kind: "video",
      meta: { production_unit_id: unit.id, input_hash: unit.context_hash },
    },
  ])[0];
  approveProductionUnit(store, unit.id, asset.id, "Viewed complete final mix", {
    sha256: "a".repeat(64),
    durationMs: 4000,
    width: 320,
    height: 180,
    fps: 24,
    hasAudio: true,
  });
  assert.equal(store.find("production_units", unit.id)?.status, "approved");
  const layout = structuredClone(graph.document);
  layout.editor.viewport.x = 100;
  const next = saveGraphInStore(store, {
    graph_id: graph.id,
    expected_revision: graph.revision,
    document: layout,
  });
  assert.equal(store.find("production_units", unit.id)?.status, "approved");
  assert.equal(
    store.find("production_units", unit.id)?.graph_revision,
    next.revision,
  );
  const changed = structuredClone(layout);
  changed.nodes[1].choices![0].effects[0].value = 11;
  saveGraphInStore(store, {
    graph_id: graph.id,
    expected_revision: next.revision,
    document: changed,
  });
  assert.equal(store.find("production_units", unit.id)?.status, "stale");
});
test("documented records are immutable to AI and retain human correction evidence", () => {
  const { store } = fixtureStore();
  const source = store.insert("historical_sources", [
    {
      project_id: store.projectId,
      kind: "book",
      title: "Synthetic source",
      citation: "Test only",
    },
  ])[0];
  const h: HistoricalRecord = {
    classification: "DOCUMENTED",
    statement: "Synthetic fact",
    date: { label: "1941", earliest: null, latest: null, precision: "year" },
    locationEntryId: null,
    sourceRefs: [
      { sourceId: source.id, locator: "p.12", excerpt: null, note: "" },
    ],
    confidence: "high",
    mutable: false,
    review: { status: "draft", reviewedAt: null, note: "" },
  };
  const e = store.insert("bible_entries", [
    {
      project_id: store.projectId,
      kind: "lore",
      name: "Test fact",
      doc: { historical: h },
    },
  ])[0];
  assert.throws(
    () =>
      store.update("bible_entries", [e], {
        doc: { historical: { ...h, classification: "FICTIONAL" } },
      }),
    { code: "STORY_DOCUMENTED_LOCK" },
  );
  assert.throws(() => store.remove("bible_entries", [e]), {
    code: "STORY_DOCUMENTED_LOCK",
  });
  correctHistoricalRecord(
    store,
    e.id,
    { ...h, statement: "Corrected synthetic fact" },
    "Human correction based on p.12",
  );
  assert.equal(
    store.find("bible_entries", e.id)?.doc.historicalRevisions.length,
    1,
  );
  assert.equal(
    store.find("bible_entries", e.id)?.doc.historical.statement,
    "Corrected synthetic fact",
  );
});
test("Latvian retrieval works without embeddings or credentials", () => {
  const { store } = fixtureStore();
  const doc = store.insert("rag_documents", [
    { project_id: store.projectId, title: "Rīgas stacija" },
  ])[0];
  store.insert("rag_chunks", [
    { document_id: doc.id, idx: 0, content: "Anna slēpjas Rīgas stacijā." },
  ]);
  const rows = searchHistoricalSources(store, "Rīgas Anna");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].method, "lexical");
  assert.match(rows[0].content, /slēpjas/);
  assert.deepEqual(searchHistoricalSources(store, "unmatchedword"), []);
});
test("speech cache includes exact Latvian text, controls and voice reference revision", async () => {
  const line = normalizeDialogue({
    speaker_id: "anna",
    line: "  Es esmu šeit!  ",
    emotion: "fear",
    intensity: 0.5,
    pace: 1.1,
  });
  assert.equal(line.line, "  Es esmu šeit!  ");
  assert.equal(line.language, "lv");
  const voice = {
      rootEntryId: "anna",
      referenceAssetId: "reference",
      referenceRevision: 1,
    },
    p = { id: "local", modelRevision: "1" };
  assert.notEqual(
    await dialogueCacheKey(line, voice, p),
    await dialogueCacheKey({ ...line, pace: 1.2 }, voice, p),
  );
  assert.notEqual(
    await dialogueCacheKey(line, voice, p),
    await dialogueCacheKey(line, { ...voice, referenceRevision: 2 }, p),
  );
  assert.equal(
    checkDialogueCapability(line, { languages: ["en"], controls: [] }).length,
    4,
  );
  assert.throws(() => normalizeDialogue({ ...line, intensity: 2 }));
});
test("ducking uses existing preview/render automation and releases after speech", () => {
  const points = duckingEnvelope([{ startMs: 1000, endMs: 2000 }], 4000).map(
    (p) => ({ t_ms: p.t_ms, gain_db: p.db }),
  );
  assert.equal(gainAtMs(points, 0), 0);
  assert.equal(gainAtMs(points, 1500), -12);
  assert.equal(gainAtMs(points, 3000), 0);
  assert.equal(gainAtMs(points, 2125), -6);
});
test("local profiles reject deceptive, remote and credential-bearing destinations", () => {
  for (const u of [
    "http://127.0.0.1:8189",
    "http://localhost:1234/v1",
    "http://[::1]:11434",
  ])
    assert.ok(validateLocalEndpoint(u));
  for (const u of [
    "http://127.0.0.1.evil.test",
    "https://example.com",
    "http://localhost@evil.test",
    "file:///tmp/file",
    "http://192.168.1.2",
    "http://user:pass@localhost",
  ])
    assert.throws(() => validateLocalEndpoint(u));
});
test("export refuses incomplete media and director proposals never apply without review", async () => {
  const { store, graph } = fixtureStore();
  await assert.rejects(
    () => prepareStoryExport(store, graph),
    /Approve a scene/,
  );
  const doc = structuredClone(graph.document);
  doc.nodes[0].title = "Proposed station";
  const proposal: any = runStoryTool(store, "propose_story_graph", {
    graph_id: graph.id,
    expected_revision: 1,
    document: doc,
    summary: "Rename station",
  });
  assert.equal(proposal.applied, false);
  assert.notEqual(
    store.find("story_graphs", graph.id)?.document.nodes[0].title,
    doc.nodes[0].title,
  );
  applyStoryProposal(store, proposal.proposalId);
  assert.equal(
    store.find("story_graphs", graph.id)?.document.nodes[0].title,
    doc.nodes[0].title,
  );
});
