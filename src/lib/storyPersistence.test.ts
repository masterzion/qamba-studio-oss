import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore, SNAPSHOT_VERSION } from "./localStore.ts";
import { emptyGraph } from "./storySchema.ts";
import { saveGraphInStore } from "./storyPersistence.ts";
const pid = "60000000-0000-4000-8000-000000000001";
function store() {
  const s = new LocalStore(pid, "local");
  s.insert("projects", [{ id: pid, title: "Fixture" }]);
  return s;
}
test("graph save archives previous document and refuses stale revision and raw writes", () => {
  const s = store(),
    g = saveGraphInStore(s, { expected_revision: 0, document: emptyGraph() });
  let notices = 0;
  s.onChange(() => notices++);
  const next = saveGraphInStore(s, {
    graph_id: g.id,
    expected_revision: 1,
    document: g.document,
  });
  assert.equal(next.revision, 2);
  assert.equal(notices, 1);
  assert.equal(s.rows("story_graph_revisions").length, 1);
  assert.throws(
    () =>
      saveGraphInStore(s, {
        graph_id: g.id,
        expected_revision: 1,
        document: g.document,
      }),
    { code: "STORY_REVISION_CONFLICT" },
  );
  assert.throws(
    () => s.update("story_graphs", s.rows("story_graphs"), { document: {} }),
    { code: "STORY_COMMAND_REQUIRED" },
  );
});
test("multi-table command failure restores rows, indices, revision and ledger without notification", () => {
  const s = store(),
    before = s.snapshot(),
    rev = s.revision;
  let notices = 0;
  s.onChange(() => notices++);
  assert.throws(() =>
    s.command(() => {
      s.insert("episodes", [{ project_id: pid, code: "X" }]);
      throw new Error("failed");
    }),
  );
  assert.deepEqual(s.snapshot().tables, before.tables);
  assert.deepEqual(s.pendingChanges(), before.pending);
  assert.equal(s.revision, rev);
  assert.equal(notices, 0);
});
test("v1 snapshots upgrade and unknown/newer data fails closed", () => {
  const snap = store().snapshot();
  snap.version = 1;
  const s = LocalStore.fromSnapshot(snap, "local");
  assert.equal(s.snapshot().version, SNAPSHOT_VERSION);
  assert.equal(s.find("projects", pid)?.settings.narrative_mode, "linear");
  assert.throws(
    () => LocalStore.fromSnapshot({ ...snap, version: 99 }, "local"),
    { code: "0A000" },
  );
  assert.throws(
    () =>
      LocalStore.fromSnapshot(
        { ...snap, tables: { ...snap.tables, unknown: [{ id: "x" }] } },
        "local",
      ),
    { code: "0A000" },
  );
});
