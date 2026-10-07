import {
  ENGINE_VERSION,
  validateGraph,
  initialStateFromDefinitions,
} from "../../director/story_runtime.js";
import type { GraphDocument } from "./storyTypes.ts";
export { validateGraph, ENGINE_VERSION };
export function emptyGraph(): GraphDocument {
  const id = crypto.randomUUID();
  const stateDefinitions = {
    paths: {
      "variables.suspicion": {
        type: "number" as const,
        default: 20,
        min: 0,
        max: 100,
      },
      "flags.injured": { type: "boolean" as const, default: false },
    },
  };
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    entryNodeId: id,
    defaultLanguage: "lv",
    nodes: [
      {
        id,
        type: "ending",
        title: "Untitled ending",
        condition: null,
        enterEffects: [],
        sourceRefs: [],
        tags: [],
        classification: "mixed",
        outcomes: {},
        historicalExplanation: "",
        educationalSummary: "",
      },
    ],
    edges: [],
    stateDefinitions,
    initialState: initialStateFromDefinitions(stateDefinitions),
    editor: {
      positions: { [id]: { x: 100, y: 100 } },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    metadata: {},
  };
}
