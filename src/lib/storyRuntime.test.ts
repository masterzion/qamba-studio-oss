import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateGraph,
  evaluateCondition,
  applyEffects,
  startSession,
  stepSession,
  replaySession,
  listChoices,
  canonicalJSON,
} from "../../director/story_runtime.js";
const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../contracts/story/v1/fixtures/reconvergence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const conformance = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../contracts/story/v1/runtime-conformance.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("both paths retain independent state after reconvergence and terminate correctly", () => {
  assert.equal(validateGraph(fixture).ok, true);
  for (const c of conformance.cases) {
    const shared = replaySession(
      fixture,
      undefined,
      undefined,
      c.edgeIds.slice(0, 3),
    );
    assert.equal(shared.currentNodeId, fixture.nodes[4].id);
    assert.equal(shared.state.variables.suspicion, c.suspicion);
    assert.equal(shared.state.flags.injured, c.injured);
    const result = replaySession(fixture, undefined, undefined, c.edgeIds);
    assert.equal(result.currentNodeId, c.endingId);
    assert.equal(result.ended, true);
  }
  assert.equal(fixture.initialState.variables.suspicion, 20);
});
test("all comparison/logical operators have strict and deterministic semantics", () => {
  const d = {
    paths: {
      "x.value": { type: "number" },
      "x.text": { type: "string" },
      "x.items": { type: "set" },
      "x.optional": { type: "string", optional: true },
    },
  };
  const state = { x: { value: 4, text: "Anna", items: ["map"] } };
  for (const [operator, value] of [
    ["eq", 4],
    ["neq", 3],
    ["gt", 3],
    ["gte", 4],
    ["lt", 5],
    ["lte", 4],
  ])
    assert.equal(
      evaluateCondition({ path: "x.value", operator, value }, state, d).ok,
      true,
    );
  assert.equal(
    evaluateCondition({ path: "x.value", operator: "eq", value: "4" }, state, d)
      .ok,
    false,
  );
  for (const path of ["x.text", "x.items"])
    assert.equal(
      evaluateCondition(
        {
          path,
          operator: "contains",
          value: path.endsWith("text") ? "Ann" : "map",
        },
        state,
        d,
      ).ok,
      true,
    );
  assert.equal(
    evaluateCondition(
      { path: "x.items", operator: "notContains", value: "photo" },
      state,
      d,
    ).ok,
    true,
  );
  assert.equal(
    evaluateCondition({ path: "x.optional", operator: "notExists" }, state, d)
      .ok,
    true,
  );
  assert.equal(
    evaluateCondition({ path: "x.value", operator: "exists" }, state, d).ok,
    true,
  );
  assert.equal(
    evaluateCondition(
      { path: "x.optional", operator: "neq", value: "a" },
      state,
      d,
    ).ok,
    false,
  );
  assert.equal(
    evaluateCondition(
      {
        all: [
          { any: [{ path: "x.value", operator: "eq", value: 4 }] },
          { not: { path: "x.value", operator: "eq", value: 5 } },
        ],
      },
      state,
      d,
    ).ok,
    true,
  );
});
test("effects reject unsafe targets and roll back the entire transition", () => {
  const g = structuredClone(fixture),
    s = startSession(g),
    before = canonicalJSON(s);
  assert.equal(
    applyEffects(
      s.state,
      [{ operation: "set", path: "__proto__.polluted", value: true }],
      g.stateDefinitions,
    ).ok,
    false,
  );
  const result = applyEffects(
    s.state,
    [
      { operation: "increment", path: "variables.suspicion", value: 1 },
      { operation: "increment", path: "variables.suspicion", value: 1000 },
    ],
    g.stateDefinitions,
  );
  assert.equal(result.ok, false);
  assert.equal(canonicalJSON(s), before);
  assert.equal(({} as any).polluted, undefined);
});
test("ambiguous cases, stale sessions, and foreign edges are refused", () => {
  const g = structuredClone(fixture),
    c = conformance.cases[1];
  const s = replaySession(g, undefined, undefined, c.edgeIds.slice(0, 4));
  g.nodes[5].cases.push({ ...g.nodes[5].cases[0], id: crypto.randomUUID() });
  assert.throws(() => stepSession(g, s, c.edgeIds[4]), {
    code: "STORY_AMBIGUOUS_CONDITIONAL",
  });
  assert.throws(
    () =>
      stepSession({ id: "story", revision: 2, document: g }, s, c.edgeIds[4]),
    { code: "STORY_REVISION_CONFLICT" },
  );
  assert.throws(
    () => stepSession(fixture, startSession(fixture), c.edgeIds[4]),
    { code: "STORY_INVALID_EDGE" },
  );
});
test("blocked choices include target-effect failures before the author clicks", () => {
  const g = structuredClone(fixture);
  g.nodes[1].choices[0].effects[0].value = 100;
  const s = stepSession(g, startSession(g), g.edges[0].id);
  const choices = listChoices(g, s);
  assert.equal(choices.available.length, 1);
  assert.equal(choices.blocked.length, 1);
});
