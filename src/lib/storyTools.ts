import { validateGraph, replaySession } from "../../director/story_runtime.js";
import { validateStory } from "./storyValidation.ts";
import { searchHistoricalSources } from "./historicalBible.ts";
import { assertGraphReferences, saveGraphInStore } from "./storyPersistence.ts";
import type { LocalStore } from "./localStore.ts";
import type { ToolDef } from "./localDirectorRules.ts";
const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const STORY_TOOLS: ToolDef[] = [
  {
    name: "get_story_graph",
    description:
      "Read an interactive graph and its revision before proposing an edit",
    input_schema: object({ graph_id: { type: "string" } }, ["graph_id"]),
  },
  {
    name: "validate_story_graph",
    description:
      "Deterministic syntax, edges, cycles and reference diagnostics",
    input_schema: object({ graph_id: { type: "string" } }, ["graph_id"]),
  },
  {
    name: "simulate_story_path",
    description: "Replay UUID edges through the exact game runtime",
    input_schema: object(
      {
        graph_id: { type: "string" },
        edge_history: { type: "array", items: { type: "string" } },
      },
      ["graph_id", "edge_history"],
    ),
  },
  {
    name: "propose_story_graph",
    description:
      "Stage a complete graph document against an expected revision for human review. Never applies it or edits history/media.",
    input_schema: object(
      {
        graph_id: { type: "string" },
        expected_revision: { type: "integer" },
        document: { type: "object" },
        summary: { type: "string" },
      },
      ["graph_id", "expected_revision", "document", "summary"],
    ),
  },
  {
    name: "search_historical_sources",
    description:
      "Search local source text and citations with deterministic lexical ranking",
    input_schema: object({ query: { type: "string" } }, ["query"]),
  },
];
export const STORY_TOOL_NAMES = new Set(STORY_TOOLS.map((t) => t.name));
export function runStoryTool(
  store: LocalStore,
  name: string,
  input: any,
  provenance: Record<string, unknown> = {
    origin: "manual",
    promptVersion: "story-tools-v1",
  },
) {
  if (name === "search_historical_sources")
    return searchHistoricalSources(store, String(input.query ?? ""));
  const graph = store.find("story_graphs", input.graph_id);
  if (!graph) throw new Error("Graph does not belong to this project");
  if (name === "get_story_graph") return structuredClone(graph);
  if (name === "validate_story_graph")
    return validateStory(graph.document, {
      sceneIds: new Set(store.rows("scenes").map((s) => s.id)),
      sources: new Map(store.rows("historical_sources").map((s) => [s.id, s])),
    });
  if (name === "simulate_story_path")
    return replaySession(graph, undefined, undefined, input.edge_history);
  if (name !== "propose_story_graph") throw new Error("Unknown story tool");
  if (graph.revision !== input.expected_revision)
    throw new Error("Revision conflict; read the graph again");
  const result = validateGraph(input.document);
  if (!result.ok) return { applied: false, diagnostics: result.errors };
  assertGraphReferences(store, input.document);
  const project = store.find("projects", store.projectId)!;
  const proposal = {
    id: crypto.randomUUID(),
    graphId: graph.id,
    baseRevision: graph.revision,
    document: structuredClone(input.document),
    summary: String(input.summary).slice(0, 4000),
    diagnostics: validateStory(input.document),
    createdAt: new Date().toISOString(),
    provenance: structuredClone(provenance),
  };
  store.update("projects", [project], {
    settings: {
      ...project.settings,
      story_proposals: [
        ...(project.settings?.story_proposals ?? []).slice(-19),
        proposal,
      ],
    },
  });
  return {
    applied: false,
    proposalId: proposal.id,
    summary: proposal.summary,
    diagnostics: proposal.diagnostics,
    requires: "human review",
  };
}
export function applyStoryProposal(store: LocalStore, id: string) {
  const project = store.find("projects", store.projectId)!,
    proposal = project.settings?.story_proposals?.find((p: any) => p.id === id);
  if (!proposal) throw new Error("Proposal is missing");
  // Graph command validates references and expected revision again at acceptance.
  return saveGraphInStore(
    store,
    {
      graph_id: proposal.graphId,
      expected_revision: proposal.baseRevision,
      document: proposal.document,
      reason: `Accept proposal: ${proposal.summary}`,
    },
    () => {
      store.update("projects", [project], {
        settings: {
          ...project.settings,
          story_proposals: project.settings.story_proposals.filter(
            (p: any) => p.id !== id,
          ),
        },
      });
    },
  );
}
