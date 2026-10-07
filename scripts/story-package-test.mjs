import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { canonicalJSON } from "../director/story_runtime.js";
const folder = fs.realpathSync.native(path.resolve(process.argv[2] ?? ""));
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/story-package-test.mjs <package-directory>",
  );
const read = (p) => JSON.parse(fs.readFileSync(path.join(folder, p), "utf8"));
const manifest = read("manifest.json");
assert.equal(manifest.format, "chronolatvia-interactive-story");
assert.ok([1, 2].includes(manifest.formatVersion));
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
const names = new Set();
for (const f of manifest.files) {
  assert.ok(!names.has(f.path));
  names.add(f.path);
  assert.ok(
    !path.isAbsolute(f.path) &&
      !f.path.includes("\\") &&
      f.path.split("/").every((p) => p && p !== ".." && p !== "."),
  );
  const full = fs.realpathSync.native(path.join(folder, f.path));
  assert.ok(full.startsWith(folder + path.sep));
  const bytes = fs.readFileSync(full);
  assert.equal(bytes.length, f.bytes);
  assert.equal(digest(bytes), f.sha256);
}
const { contentHash, ...rest } = manifest;
assert.equal(digest(canonicalJSON(rest)), contentHash);
assert.ok(names.has("runtime/story-runtime.mjs"));
assert.equal(
  digest(fs.readFileSync(path.join(folder, "runtime/story-runtime.mjs"))),
  digest(
    fs.readFileSync(new URL("../director/story_runtime.js", import.meta.url)),
  ),
  "Only the shipped runtime may execute",
);
const runtime = await import(
  pathToFileURL(path.join(folder, "runtime/story-runtime.mjs"))
);
const graph = read("graph.json"),
  scenes = read("scenes.json"),
  tests = read("runtime/conformance.json");
const attachments = names.has("assets.json") ? read("assets.json") : [],
  assetIds = new Set(attachments.map((a) => a.assetId));
for (const asset of attachments)
  assert.ok(
    names.has(asset.mediaPath),
    "Attachment bytes must be part of the verified package",
  );
for (const node of graph.nodes) {
  for (const choice of node.choices ?? [])
    if (choice.iconAssetId) assert.ok(assetIds.has(choice.iconAssetId));
  for (const id of [
    node.presentation?.posterAssetId,
    node.presentation?.subtitleAssetId,
  ])
    if (id) assert.ok(assetIds.has(id));
}
assert.equal(runtime.validateGraph(graph).ok, true);
if (manifest.playable === false) {
  assert.equal(scenes.length, 0);
  console.log(
    `Authoring package checksums and graph validated: ${contentHash}`,
  );
  process.exit(0);
}
assert.ok(tests.cases.length > 0, "At least one witnessed ending is required");
for (const c of tests.cases) {
  const session = runtime.replaySession(
    { id: manifest.storyId, revision: manifest.graphRevision, document: graph },
    undefined,
    undefined,
    c.edgeHistory,
  );
  assert.equal(session.ended, true);
  assert.equal(session.currentNodeId, c.currentNodeId);
  assert.deepEqual(session.state, c.state);
  assert.deepEqual(session.outcome, c.outcome);
  let partial = runtime.startSession(graph);
  for (const edge of c.edgeHistory) {
    const scene = scenes.find((n) => n.nodeId === partial.currentNodeId);
    if (scene) {
      for (const language of manifest.languages ?? [manifest.language]) {
        const matches = scene.variants.filter(
          (v) =>
            (v.speechLanguage ?? manifest.language) === language &&
            runtime.evaluateCondition(
              v.when,
              partial.state,
              graph.stateDefinitions,
            ).ok,
        );
        assert.equal(matches.length, 1);
        assert.ok(names.has(matches[0].mediaPath));
        for (const subtitle of Object.values(matches[0].subtitles ?? {}))
          assert.ok(names.has(subtitle));
      }
    }
    partial = runtime.stepSession(graph, partial, edge);
  }
}
const player = await import(
  pathToFileURL(path.join(folder, "runtime/story-player.mjs"))
);
const witnessed = [];
for (const language of manifest.languages ?? [manifest.language])
  for (const c of tests.cases) {
    const game = player.createStoryPlayer(
      { manifest, graph, scenes },
      { language },
    );
    while (!game.current().ended) {
      const current = game.current(),
        edgeId = c.edgeHistory[game.save().edgeHistory.length];
      if (current.presentation) {
        assert.equal(
          current.presentation.speechLanguage ?? manifest.language,
          language,
        );
        assert.equal(current.choices.length, 0);
        assert.throws(() => game.choose(edgeId, current.nonce), /premature/);
        assert.equal(game.finishVideo(current.nonce), true);
        assert.equal(game.finishVideo(current.nonce), false);
      }
      const saved = game.save();
      game.restore(saved);
      const restored = game.current();
      if (restored.presentation) game.finishVideo(restored.nonce);
      game.choose(edgeId, restored.nonce);
      assert.throws(() => game.choose(edgeId, restored.nonce), /Stale/);
    }
    assert.equal(game.current().node.id, c.currentNodeId);
    witnessed.push({
      language,
      endingId: c.currentNodeId,
      edgeHistory: game.save().edgeHistory,
    });
  }
fs.writeFileSync(
  path.join(path.dirname(folder), "playback-witnesses.json"),
  JSON.stringify(witnessed, null, 2),
);
console.log(
  `Package checksums, ${tests.cases.length} ending witnesses and presentation bindings passed. ${contentHash}`,
);
