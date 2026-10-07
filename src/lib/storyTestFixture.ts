import rawFixture from "../../contracts/story/v1/fixtures/reconvergence.json" with { type: "json" };
import rawPaths from "../../contracts/story/v1/runtime-conformance.json" with { type: "json" };
import { LocalStore } from "./localStore.ts";
import { saveGraphInStore } from "./storyPersistence.ts";
import type { GraphDocument, StoryGraph } from "./storyTypes.ts";
export const fixture = rawFixture as GraphDocument;
export const paths = rawPaths.cases;
export function fixtureStore() {
  const pid = "60000000-0000-4000-8000-000000000001",
    store = new LocalStore(pid, "local");
  store.insert("projects", [
    {
      id: pid,
      title: "Test",
      settings: { narrative_mode: "interactive", offline_only: true },
    },
  ]);
  const episode = store.insert("episodes", [
      { project_id: pid, code: "FIXTURE" },
    ])[0],
    board = store.insert("storyboards", [
      { episode_id: episode.id, version: 1 },
    ])[0];
  for (const n of fixture.nodes.filter((n) => n.type === "scene"))
    store.insert("scenes", [
      {
        id: n.sceneId,
        storyboard_id: board.id,
        idx: store.rows("scenes").length,
        slug: n.title,
        meta: {},
      },
    ]);
  const graph = saveGraphInStore(store, {
    expected_revision: 0,
    document: structuredClone(fixture),
  }) as StoryGraph;
  return { store, graph, board, episode };
}
