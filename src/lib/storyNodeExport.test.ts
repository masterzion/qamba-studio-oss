import test from "node:test";
import assert from "node:assert/strict";
import { fixtureStore, paths } from "./storyTestFixture.ts";
import {
  approveProductionUnit,
  captureProductionContext,
  createProductionUnit,
} from "./productionContext.ts";
import {
  buildStoryNodeExport,
  storyNodeExportFileName,
} from "./storyNodeExport.ts";

async function addApprovedVideo(
  store: ReturnType<typeof fixtureStore>["store"],
  graph: ReturnType<typeof fixtureStore>["graph"],
  edgeHistory: string[],
  id: string,
  key: string,
) {
  const context = await captureProductionContext(store, graph, edgeHistory, {
    visualSignature: {},
    canonicalSelections: [],
    productionSettings: {
      model_key: "test",
      presentationWhen: { path: "flags.injured", operator: "eq", value: false },
    },
  });
  const unit = createProductionUnit(store, context);
  const asset = store.insert("assets", [
    {
      id,
      project_id: store.projectId,
      kind: "video",
      b2_key: key,
      content_type: "video/mp4",
      meta: { production_unit_id: unit.id, input_hash: unit.context_hash },
    },
  ])[0];
  approveProductionUnit(store, unit.id, asset.id, "Synthetic review", {
    sha256: "a".repeat(64),
    durationMs: 4200,
    width: 1920,
    height: 1080,
    fps: 24,
    hasAudio: true,
  });
  return { context, unit };
}

test("node export preserves choices and approved final rendered video paths", async () => {
  const { store, graph } = fixtureStore();
  const context = await captureProductionContext(
    store,
    graph,
    paths[0].edgeIds.slice(0, 3),
    {
      visualSignature: {},
      canonicalSelections: [],
      productionSettings: {
        model_key: "test",
        presentationWhen: { path: "flags.injured", operator: "eq", value: false },
      },
    },
  );
  const unit = createProductionUnit(store, context);
  const scene = graph.document.nodes.find((node) => node.id === context.nodeId)!;
  const asset = store.insert("assets", [
    {
      id: "video-1",
      project_id: store.projectId,
      kind: "video",
      b2_key: "renders/final-scene.mp4",
      content_type: "video/mp4",
      duration_ms: 4200,
      width: 1920,
      height: 1080,
      fps: 24,
      meta: {
        production_unit_id: unit.id,
        input_hash: unit.context_hash,
      },
    },
  ])[0];
  approveProductionUnit(store, unit.id, asset.id, "Synthetic review", {
    sha256: "a".repeat(64),
    durationMs: 4200,
    width: 1920,
    height: 1080,
    fps: 24,
    hasAudio: true,
  });

  const exported = buildStoryNodeExport(
    graph,
    store,
    "2026-10-09T00:00:00.000Z",
  );
  const exportedScene = exported.nodes.find((node) => node.id === scene.id)!;
  assert.deepEqual(exportedScene.choices, scene.choices);
  assert.equal(exportedScene.finalRenderedVideoPath, "renders/final-scene.mp4");
  assert.equal(exportedScene.finalRenderedVideoPaths[0], "renders/final-scene.mp4");
  assert.equal(
    exportedScene.finalRenderedVideos[0].assetKey,
    "renders/final-scene.mp4",
  );
  assert.equal(exported.edges.length, graph.document.edges.length);
  assert.equal(exported.exportedAt, "2026-10-09T00:00:00.000Z");
});

test("node export uses a JSON filename", () => {
  assert.equal(storyNodeExportFileName("Rīga: The Story"), "Rīga-The-Story.json");
  assert.equal(storyNodeExportFileName("   "), "story-graph.json");
});

test("node export includes approved variants and excludes stale units", async () => {
  const { store, graph } = fixtureStore();
  const first = await addApprovedVideo(
    store,
    graph,
    paths[0].edgeIds.slice(0, 3),
    "video-a",
    "renders/variant-a.mp4",
  );
  await addApprovedVideo(
    store,
    graph,
    paths[1].edgeIds.slice(0, 3),
    "video-b",
    "renders/variant-b.mp4",
  );
  const stale = await addApprovedVideo(
    store,
    graph,
    paths[0].edgeIds.slice(0, 2),
    "video-stale",
    "renders/stale.mp4",
  );
  store.update("production_units", [store.find("production_units", stale.unit.id)!], {
    status: "stale",
  });

  const exported = buildStoryNodeExport(graph, store);
  const videos = exported.nodes
    .find((node) => node.id === first.context.nodeId)!
    .finalRenderedVideos;
  assert.deepEqual(
    videos.map((video) => video.assetKey).sort(),
    ["renders/variant-a.mp4", "renders/variant-b.mp4"],
  );
  assert.equal(
    exported.nodes.find((node) => node.id === stale.context.nodeId)!
      .finalRenderedVideos.length,
    0,
  );
});
