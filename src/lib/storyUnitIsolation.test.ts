import test from "node:test";
import assert from "node:assert/strict";
import { fixtureStore, paths } from "./storyTestFixture.ts";
import {
  captureProductionContext,
  createProductionUnit,
  approveProductionUnit,
} from "./productionContext.ts";
test("keeping a new take revokes only its unit and follows actual chain dependants", async () => {
  const { store, graph, board } = fixtureStore(),
    units = [];
  for (const p of paths) {
    const context = await captureProductionContext(
        store,
        graph,
        p.edgeIds.slice(0, 3),
        {
          visualSignature: {},
          canonicalSelections: [],
          productionSettings: { model_key: "test" },
        },
      ),
      unit = createProductionUnit(store, context),
      asset = store.insert("assets", [
        {
          project_id: store.projectId,
          kind: "video",
          b2_key: unit.id + ".mp4",
          meta: { production_unit_id: unit.id, input_hash: unit.context_hash },
        },
      ])[0];
    approveProductionUnit(store, unit.id, asset.id, "Synthetic review", {
      sha256: "c".repeat(64),
      durationMs: 4000,
      width: 320,
      height: 180,
      fps: 24,
      hasAudio: true,
    });
    units.push(unit);
  }
  const blocks = units.map(
    (u) =>
      store.insert("generation_blocks", [
        {
          storyboard_id: board.id,
          production_unit_id: u.id,
          scene_ids: [u.scene_id],
          idx: 0,
        },
      ])[0],
  );
  const next = store.insert("generation_blocks", [
    {
      storyboard_id: board.id,
      production_unit_id: units[0].id,
      scene_ids: [units[0].scene_id],
      idx: 1,
      chain_from_block_id: blocks[0].id,
      status: "generated",
    },
  ])[0];
  const take = store.insert("block_takes", [
    { block_id: blocks[0].id, state: "kept" },
  ])[0];
  store.update("generation_blocks", [blocks[0]], { active_take_id: take.id });
  assert.equal(store.find("production_units", units[0].id)?.status, "draft");
  assert.equal(
    store.find("production_units", units[0].id)?.approved_asset_id,
    null,
  );
  assert.equal(store.find("production_units", units[1].id)?.status, "approved");
  assert.equal(store.find("generation_blocks", next.id)?.status, "stale");
  assert.notEqual(
    store.find("generation_blocks", blocks[1].id)?.status,
    "stale",
  );
});
