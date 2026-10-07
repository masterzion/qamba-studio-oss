import assert from "node:assert/strict";
import test from "node:test";
import {
  validateSubtitleCues,
  serializeSubtitles,
  reviewSubtitles,
  registerStorySubtitleAssets,
} from "./storySubtitles.ts";
import { storyV2Fixture } from "./storyV2Fixture.ts";
import {
  captureProductionContext,
  createProductionUnit,
  approveProductionUnit,
} from "./productionContext.ts";
import { newStoryInStore } from "./storyAuthoring.ts";
import { fixtureStore } from "./storyTestFixture.ts";
import { prepareStoryExport } from "./storyExport.ts";
import { createStoryPlayer } from "../../director/story_player.mjs";
test("subtitle translations share measured timings and preserve Latvian UTF-8", () => {
  const cues = [{ id: "cue", lineId: "line", startMs: 1234, endMs: 3456 }],
    lines = [
      { id: "line", text: { lv: "Rīga — viņš nāk.", en: "He is coming." } },
    ];
  validateSubtitleCues(cues, 4000, new Set(["line"]));
  assert.match(
    serializeSubtitles(cues, lines, "lv", "vtt"),
    /00:00:01.234 --> 00:00:03.456\nRīga — viņš nāk./,
  );
  assert.match(
    serializeSubtitles(cues, lines, "en", "srt"),
    /00:00:01,234 --> 00:00:03,456/,
  );
  assert.throws(
    () =>
      validateSubtitleCues(
        [...cues, { ...cues[0], id: "two", startMs: 3000 }],
        4000,
        new Set(["line"]),
      ),
    /non-overlapping/,
  );
  assert.throws(
    () => serializeSubtitles(cues, lines, "de", "vtt"),
    /Translate/,
  );
});
test("subtitle timestamps handle hour boundaries and refuse cue injection", () => {
  const cues = [
      { id: "cue", lineId: "line", startMs: 3599999, endMs: 3600001 },
    ],
    lines = [{ id: "line", text: { lv: "Rīga\nĢimene" } }];
  validateSubtitleCues(cues, 3600100, new Set(["line"]));
  assert.match(
    serializeSubtitles(cues, lines, "lv", "srt"),
    /00:59:59,999 --> 01:00:00,001/,
  );
  assert.throws(
    () =>
      validateSubtitleCues(
        [{ ...cues[0], id: "bad\ncue" }],
        3600100,
        new Set(["line"]),
      ),
    /Subtitle cues/,
  );
  assert.throws(
    () =>
      serializeSubtitles(
        cues,
        [{ id: "line", text: { lv: "First\n\nSecond" } }],
        "lv",
        "vtt",
      ),
    /delimiter/,
  );
});
test("reviewed translated subtitles are registered only after successful media writes", async () => {
  const { store, graph } = storyV2Fixture(),
    context = await captureProductionContext(
      store,
      graph,
      [graph.document.edges[0].id],
      {
        visualSignature: {},
        canonicalSelections: [],
        productionSettings: { language: "lv", model_key: "synthetic" },
      },
    ),
    unit = createProductionUnit(store, context);
  const asset = store.insert("assets", [
    {
      project_id: store.projectId,
      kind: "video",
      b2_key: "synthetic.mp4",
      meta: { production_unit_id: unit.id, input_hash: unit.context_hash },
    },
  ])[0];
  approveProductionUnit(store, unit.id, asset.id, "Synthetic review", {
    sha256: "a".repeat(64),
    durationMs: 1000,
    width: 320,
    height: 180,
    fps: 24,
    hasAudio: true,
  });
  await reviewSubtitles(
    store,
    unit.id,
    [
      {
        id: "cue",
        lineId: context.productionSettings.storyContent.dialogue[0].id,
        startMs: 100,
        endMs: 900,
      },
    ],
    "Reviewed synthetic timings",
  );
  await assert.rejects(
    () =>
      registerStorySubtitleAssets(store, unit.id, async () => {
        throw new Error("disk full");
      }),
    /disk full/,
  );
  assert.equal(
    store.find("production_units", unit.id)!.subtitle_document.assetIds,
    undefined,
  );
  const writes = new Map();
  await registerStorySubtitleAssets(store, unit.id, async (key, text) => {
    writes.set(key, text);
  });
  const ids = store.find("production_units", unit.id)!.subtitle_document
    .assetIds;
  assert.deepEqual(Object.keys(ids).sort(), [
    "en.srt",
    "en.vtt",
    "lv.srt",
    "lv.vtt",
  ]);
  for (const id of Object.values(ids)) {
    const registered = store.find("assets", id as string)!;
    assert.equal(registered.meta.review.status, "approved");
    assert.ok(writes.has(registered.b2_key));
  }
});
test("authoring export works without rendered media and is explicitly unplayable", async () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Draft"),
    spec = await prepareStoryExport(store, g, "authoring");
  assert.equal(spec.playable, false);
  assert.equal(spec.media.length, 0);
  assert.ok(spec.files.some((f) => f.path === "dialogue.json"));
  assert.throws(
    () =>
      createStoryPlayer({
        manifest: { playable: false },
        graph: g.document,
        scenes: [],
      }),
    /authoring/,
  );
  await assert.rejects(() => prepareStoryExport(store, g), /Approve/);
});
test("reference player blocks premature decisions, duplicate events and mismatched saves", () => {
  const { store } = fixtureStore(),
    g = newStoryInStore(store, "Play"),
    node = g.document.nodes[1];
  const manifest = {
    playable: true,
    storyId: g.id,
    graphRevision: g.revision,
    contentHash: "a".repeat(64),
  };
  const scenes = [
    {
      nodeId: node.id,
      variants: [
        {
          speechLanguage: "lv",
          when: { path: "flags.injured", operator: "eq", value: false },
          mediaPath: "scene.mp4",
        },
      ],
    },
  ];
  const p = createStoryPlayer({ manifest, graph: g.document, scenes });
  const current = p.current();
  assert.equal(current.node.id, node.id);
  assert.equal(current.choices.length, 0);
  assert.throws(
    () => p.choose(g.document.edges[1].id, current.nonce),
    /premature/,
  );
  assert.equal(p.finishVideo(current.nonce), true);
  assert.equal(p.finishVideo(current.nonce), false);
  assert.equal(p.current().choices.length, 1);
  const saved = p.save();
  assert.equal(p.choose(g.document.edges[1].id, current.nonce).ended, true);
  assert.throws(() => p.choose(g.document.edges[1].id, current.nonce), /Stale/);
  assert.equal(p.restore(saved).node.id, node.id);
  assert.throws(
    () => p.restore({ ...saved, graphHash: "wrong" }),
    /another graph/,
  );
});
