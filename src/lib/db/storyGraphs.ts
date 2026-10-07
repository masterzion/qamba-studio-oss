import { localStoreFor } from "../localPlane.ts";
import { saveGraphInStore, deleteGraphInStore } from "../storyPersistence.ts";
import { emptyGraph } from "../storySchema.ts";
import { newStoryInStore } from "../storyAuthoring.ts";
import type { GraphDocument, StoryGraph } from "../storyTypes.ts";
export function storyStore(projectId: string) {
  const store = localStoreFor(projectId);
  if (!store) throw new Error("Open a local project first");
  return store;
}
export async function loadGraphs(projectId: string): Promise<StoryGraph[]> { return structuredClone(storyStore(projectId).rows("story_graphs")) as StoryGraph[]; }
export async function loadGraph(projectId: string, id: string): Promise<StoryGraph | null> { return structuredClone(storyStore(projectId).find("story_graphs", id) ?? null) as StoryGraph | null; }
export async function createGraph(projectId: string, title = "Untitled story", document?: GraphDocument, defaultLanguage="lv", additionalLanguages:string[]=[]): Promise<StoryGraph> { return document ? saveGraphInStore(storyStore(projectId), { expected_revision: 0, document, title }) : newStoryInStore(storyStore(projectId),title,defaultLanguage,additionalLanguages); }
export async function saveGraph(graph: StoryGraph, document: GraphDocument, reason = "Edit story"): Promise<StoryGraph> { return saveGraphInStore(storyStore(graph.project_id), { graph_id: graph.id, expected_revision: graph.revision, document, reason, title: graph.title }); }
export async function loadGraphRevision(projectId: string, id: string, revision: number) { return structuredClone(storyStore(projectId).rows("story_graph_revisions").find(r => r.graph_id === id && r.revision === revision) ?? null); }
export async function deleteGraph(graph: StoryGraph) { deleteGraphInStore(storyStore(graph.project_id), graph.id, graph.revision); }
