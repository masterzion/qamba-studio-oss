import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalStoryLanguages,
  resolveLocalizedText,
  editLocalizedText,
} from "./storyLocalization.ts";
import {
  newStoryInStore,
  changeSceneTransition,
  migrateStoryDocument,
} from "./storyAuthoring.ts";
import { fixtureStore } from "./storyTestFixture.ts";
import { validateGraph, replaySession } from "../../director/story_runtime.js";
test("canonical languages and explicit exact/base/default fallback preserve Unicode", () => {
  assert.deepEqual(canonicalStoryLanguages("lv", ["EN-us", "en-US"]), {
    defaultLanguage: "lv",
    languages: ["lv", "en-US"],
  });
  assert.throws(() => canonicalStoryLanguages("not_a_locale"));
  const value = {
    lv: "Rīga — ģimene",
    en: "Family",
    "en-US": "Family in America",
  };
  assert.deepEqual(resolveLocalizedText(value, "en-US", "lv"), {
    text: "Family in America",
    locale: "en-US",
    fallback: false,
  });
  assert.deepEqual(resolveLocalizedText(value, "en-GB", "lv"), {
    text: "Family",
    locale: "en",
    fallback: true,
  });
  assert.deepEqual(resolveLocalizedText(value, "de", "lv"), {
    text: "Rīga — ģimene",
    locale: "lv",
    fallback: true,
  });
  assert.deepEqual(editLocalizedText(value, "de", "Familie", 2), {
    ...value,
    de: "Familie",
  });
});
test("transition conversion retains the exact edge identity and requires an explicit retained branch", () => {
  const { store } = fixtureStore(),
    graph = newStoryInStore(store, "Test", "en", ["lv"]),
    scene = graph.document.nodes[1],
    edge = graph.document.edges[1];
  const choices = changeSceneTransition(graph.document, scene.id, "choice");
  assert.equal(choices.edges[1].id, edge.id);
  assert.equal(choices.edges[1].targetNodeId, edge.targetNodeId);
  assert.equal(validateGraph(choices).ok, true);
  const secondId = crypto.randomUUID();
  choices.nodes[1].choices!.push({
    ...choices.nodes[1].choices![0],
    id: secondId,
  });
  choices.edges.push({
    ...choices.edges[1],
    id: crypto.randomUUID(),
    sourcePort: secondId,
  });
  assert.throws(
    () => changeSceneTransition(choices, scene.id, "continue"),
    /Choose the branch/,
  );
  const continued = changeSceneTransition(
    choices,
    scene.id,
    "continue",
    secondId,
  );
  assert.equal(continued.edges.at(-1)!.sourcePort, "next");
  assert.equal(continued.edges.length, 2);
  assert.equal(continued.nodes[1].choices!.length, 0);
  assert.equal(
    replaySession(
      continued,
      undefined,
      undefined,
      continued.edges.map((e) => e.id),
    ).ended,
    true,
  );
});
test("migrated explanations are independent translations and invalid START/self links fail", () => {
  const { store, graph } = fixtureStore(),
    d = migrateStoryDocument(graph.document, store);
  assert.equal(validateGraph(d).ok, true);
  assert.equal(migrateStoryDocument(d).entryNodeId, d.entryNodeId);
  const start = d.nodes[0];
  start.enterEffects = [
    { operation: "increment", path: "variables.suspicion", value: 1 },
  ];
  assert.equal(validateGraph(d).ok, false);
  start.enterEffects = [];
  d.edges[0].targetNodeId = start.id;
  assert.equal(validateGraph(d).ok, false);
});
