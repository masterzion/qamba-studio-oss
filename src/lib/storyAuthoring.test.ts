import assert from "node:assert/strict";
import test from "node:test";
import {
  newStoryInStore,
  appendStoryScene,
  migrateStoryDocument,
} from "./storyAuthoring.ts";
import { ensureStorySceneTimeline, availableStorySceneTimelines } from "./storyEditorBridge.ts";
import { fixtureStore } from "./storyTestFixture.ts";
import {
  validateGraph,
  startSession,
  listChoices,
  stepSession,
  resolveText,
} from "../../director/story_runtime.js";
import { saveGraphInStore } from "./storyPersistence.ts";
import { LocalStore } from "./localStore.ts";
import { buildStoryNodeExport } from "./storyNodeExport.ts";

test("base soundtrack paths survive save, reopen and export without timeline changes", () => {
  const { store } = fixtureStore();
  const graph = newStoryInStore(store, "Soundtrack metadata");
  const timelinesBefore = structuredClone(store.rows("timelines"));
  const node = graph.document.nodes[1];
  node.type = "base_sound_track";
  delete node.sceneId;
  delete node.content;
  delete node.choices;
  node.soundtrackPaths = ["D:/library/music/theme.wav", "D:/library/music/ambient.mp3"];
  assert.equal(validateGraph(graph).ok, true);
  const saved = saveGraphInStore(store, {
    graph_id: graph.id,
    expected_revision: graph.revision,
    document: graph.document,
  });
  const reopened = LocalStore.fromSnapshot(store.snapshot(), "local");
  const restored = reopened.find("story_graphs", saved.id)!;
  assert.deepEqual(restored.document.nodes[1].soundtrackPaths, node.soundtrackPaths);
  assert.deepEqual(buildStoryNodeExport(restored, reopened).nodes[1].soundtrackPaths, node.soundtrackPaths);
  assert.deepEqual(store.rows("timelines"), timelinesBefore);
  node.soundtrackPaths = [];
  assert.equal(validateGraph(graph).ok, true);
  node.soundtrackPaths = [""];
  assert.equal(validateGraph(graph).ok, false);
});
test("new story persists one START, real SCENE blueprint and END and traverses", () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Branching story");
  assert.equal(g.schema_version, 2);
  assert.equal(validateGraph(g).ok, true);
  assert.deepEqual(
    g.document.nodes.map((n) => n.type),
    ["start", "scene", "ending"],
  );
  assert.ok(store.find("scenes", g.document.nodes[1].sceneId!));
  let s = startSession(g);
  s = stepSession(g, s, listChoices(g, s).available[0].edgeId);
  s = stepSession(g, s, listChoices(g, s).available[0].edgeId);
  assert.equal(s.ended, true);
  assert.equal(
    LocalStore.fromSnapshot(store.snapshot(), "local").find(
      "story_graphs",
      g.id,
    )!.schema_version,
    2,
  );
});
test("scene decisions use stable choice ports and localized labels without altering effects", () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Choices"),
    d = g.document,
    n = d.nodes[1];
  d.languages = ["lv", "en"];
  n.content!.transitionMode = "choice";
  n.choices = [
    {
      id: crypto.randomUUID(),
      label: { lv: "Iet", en: "Go" },
      iconAssetId: null,
      condition: null,
      effects: [
        { operation: "increment", path: "variables.suspicion", value: 5 },
      ],
      historicalAnnotation: {},
      educationalExplanation: {},
      sourceRefs: [],
      tags: [],
    },
  ];
  d.edges[1].sourcePort = n.choices[0].id;
  const saved = saveGraphInStore(store, {
    graph_id: g.id,
    expected_revision: g.revision,
    document: d,
  });
  let s = startSession(saved);
  s = stepSession(saved, s, d.edges[0].id);
  assert.equal(
    resolveText(listChoices(saved, s).available[0].label, "en", "lv"),
    "Go",
  );
  s = stepSession(saved, s, d.edges[1].id);
  assert.equal(s.state.variables.suspicion, 25);
  d.edges.push({ ...d.edges[1], id: crypto.randomUUID() });
  assert.equal(validateGraph(d).ok, false);
});
test("migration preserves old IDs and revisions; unconnected draft scenes are saveable", () => {
  const { store, graph } = fixtureStore(),
    d = migrateStoryDocument(graph.document, store);
  assert.equal(validateGraph(d).ok, true);
  assert.equal(d.nodes[1].id, graph.document.nodes[0].id);
  const saved = saveGraphInStore(store, {
    graph_id: graph.id,
    expected_revision: graph.revision,
    document: d,
  });
  assert.equal(
    store.rows("story_graph_revisions").at(-1)!.document.schemaVersion,
    1,
  );
  assert.equal(
    appendStoryScene(store, saved).document.nodes.length,
    d.nodes.length + 1,
  );
});
test("story cuts isolate language, refuse stale revisions and survive project reload", async () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Cuts");
  g.document.languages = ["lv", "en"];
  const saved = saveGraphInStore(store, {
    graph_id: g.id,
    expected_revision: g.revision,
    document: g.document,
  });
  const args = {
    projectId: store.projectId,
    graphId: g.id,
    expectedGraphRevision: saved.revision,
    nodeId: g.document.nodes[1].id,
    language: "lv",
  };
  const a = await ensureStorySceneTimeline(store, args),
    b = await ensureStorySceneTimeline(store, args);
  assert.equal(a.timelineId, b.timelineId);
  const en = await ensureStorySceneTimeline(store, { ...args, language: "en" });
  assert.notEqual(en.timelineId, a.timelineId);
  await assert.rejects(
    () =>
      ensureStorySceneTimeline(store, { ...args, expectedGraphRevision: 1 }),
    /changed/,
  );
  assert.ok(
    LocalStore.fromSnapshot(store.snapshot(), "local").find(
      "timelines",
      a.timelineId,
    ),
  );
  assert.throws(
    () =>
      store.update("timelines", [store.find("timelines", a.timelineId)!], {
        story_node_id: crypto.randomUUID(),
      }),
    /scene/,
  );
});
test("scene timeline selection preserves prior edits and reopens the selected cut", async () => {
  const { store } = fixtureStore(), g = newStoryInStore(store, "Timeline selection", "lv", ["en"]);
  const args = { projectId: store.projectId, graphId: g.id, expectedGraphRevision: g.revision, nodeId: g.document.nodes[1].id, language: "lv" };
  const first = await ensureStorySceneTimeline(store, args);
  const firstTrack = store.rows("tracks").find((t) => t.timeline_id === first.timelineId)!;
  store.update("tracks", [firstTrack], { name: "Previously edited dialogue" });
  const oldCut = store.insert("timelines", [{ episode_id: first.episodeId, name: "Previously edited cut", fps: 24, width: 1280, height: 720 }])[0];
  const oldTrack = store.insert("tracks", [{ timeline_id: oldCut.id, kind: "video", idx: 0, name: "Existing edits" }])[0];
  assert.ok(availableStorySceneTimelines(store, g.id, args.nodeId, "lv").some((t) => t.id === oldCut.id));
  await ensureStorySceneTimeline(store, { ...args, timelineId: oldCut.id });
  assert.equal((await ensureStorySceneTimeline(store, args)).timelineId, oldCut.id);
  assert.equal(store.find("tracks", oldTrack.id)!.name, "Existing edits");
  assert.equal(store.find("tracks", firstTrack.id)!.name, "Previously edited dialogue");
  assert.equal(store.find("timelines", first.timelineId)!.meta.archived_story.nodeId, args.nodeId);
  const restored = LocalStore.fromSnapshot(store.snapshot(), "local");
  assert.equal((await ensureStorySceneTimeline(restored, args)).timelineId, oldCut.id);
  await ensureStorySceneTimeline(store, { ...args, timelineId: first.timelineId });
  assert.equal((await ensureStorySceneTimeline(store, args)).timelineId, first.timelineId);
  const en = await ensureStorySceneTimeline(store, { ...args, language: "en" });
  await assert.rejects(() => ensureStorySceneTimeline(store, { ...args, timelineId: en.timelineId }), /editable timeline/);
  const changed = appendStoryScene(store, g);
  const other = await ensureStorySceneTimeline(store, { ...args, expectedGraphRevision: changed.revision, nodeId: changed.document.nodes.at(-1)!.id });
  await assert.rejects(() => ensureStorySceneTimeline(store, { ...args, expectedGraphRevision: changed.revision, timelineId: other.timelineId }), /editable timeline/);
  assert.equal(store.find("timelines", first.timelineId)!.story_node_id, args.nodeId);
});
test("removing a scene archives its cut without deleting media, and undo reuses that cut", async () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Archive"),
    node = g.document.nodes[1];
  const args = {
    projectId: store.projectId,
    graphId: g.id,
    expectedGraphRevision: g.revision,
    nodeId: node.id,
    language: "lv",
  };
  const cut = await ensureStorySceneTimeline(store, args),
    track = store.rows("tracks").find((t) => t.timeline_id === cut.timelineId)!;
  const doc = structuredClone(g.document);
  doc.nodes = doc.nodes.filter((n) => n.id !== node.id);
  doc.edges = doc.edges.filter(
    (e) => e.sourceNodeId !== node.id && e.targetNodeId !== node.id,
  );
  const removed = saveGraphInStore(store, {
    graph_id: g.id,
    expected_revision: g.revision,
    document: doc,
  });
  assert.equal(
    store.find("timelines", cut.timelineId)!.meta.archived_story.nodeId,
    node.id,
  );
  assert.ok(store.find("tracks", track.id));
  const restored = saveGraphInStore(store, {
    graph_id: g.id,
    expected_revision: removed.revision,
    document: g.document,
  });
  assert.equal(
    (
      await ensureStorySceneTimeline(store, {
        ...args,
        expectedGraphRevision: restored.revision,
      })
    ).timelineId,
    cut.timelineId,
  );
});
