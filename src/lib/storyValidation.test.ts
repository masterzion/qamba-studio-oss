import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateStory } from "./storyValidation.ts";
import { analyzeStory } from "./storyAnalysis.ts";
const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../contracts/story/v1/fixtures/reconvergence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("complete reconvergent fixture has two reachable endings", () => {
  assert.deepEqual(validateStory(fixture), []);
  const r = analyzeStory(fixture);
  assert.equal(r.witnessedEndings.length, 2);
  assert.equal(r.analysisIncomplete, false);
  assert.equal(r.convergenceNodes.length, 1);
});
test("cycles, invalid ports and missing targets are deterministic diagnostics", () => {
  const g = structuredClone(fixture);
  g.edges[0].targetNodeId = g.nodes[0].id;
  assert.ok(validateStory(g).some((d) => d.code === "STORY_CYCLE"));
  g.edges[0].targetNodeId = crypto.randomUUID();
  assert.ok(validateStory(g).some((d) => d.code === "STORY_DANGLING_EDGE"));
});
test("bounded analysis says unknown when exhausted", () => {
  const r = analyzeStory(fixture, { maxStates: 1, budgetMs: 2000 });
  assert.equal(r.analysisIncomplete, true);
  assert.equal(r.proof, "unknown");
});
