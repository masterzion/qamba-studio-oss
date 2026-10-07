import type { LocalStore } from "./localStore.ts";
import { storyHash } from "./storyHash.ts";
export async function openStorySceneEditor({
  projectId,
  graphId,
  expectedGraphRevision,
  nodeId,
  language,
  timelineId,
}: {
  projectId: string;
  graphId: string;
  expectedGraphRevision: number;
  nodeId: string;
  language: string;
  timelineId?: string;
}) {
  const { storyStore } = await import("./db/storyGraphs.ts");
  const { saveNow } = await import("./localPlane.ts");
  await saveNow(projectId, true);
  const context = await ensureStorySceneTimeline(storyStore(projectId), {
    projectId,
    graphId,
    expectedGraphRevision,
    nodeId,
    language,
    timelineId,
  });
  await saveNow(projectId, true);
  return context;
}
export async function ensureStorySceneTimeline(
  store: LocalStore,
  {
    projectId,
    graphId,
    expectedGraphRevision,
    nodeId,
    language,
    timelineId,
  }: {
    projectId: string;
    graphId: string;
    expectedGraphRevision: number;
    nodeId: string;
    language: string;
    timelineId?: string;
  },
) {
  const graph = store.find("story_graphs", graphId);
  if (
    !graph ||
    graph.project_id !== projectId ||
    graph.revision !== expectedGraphRevision
  )
    throw new Error("Story changed. Reload before opening the scene editor.");
  const node = graph.document.nodes.find((n: any) => n.id === nodeId);
  const scene = node?.type === "scene" && store.find("scenes", node.sceneId);
  const board = scene && store.find("storyboards", scene.storyboard_id);
  const episode = board && store.find("episodes", board.episode_id);
  if (!node || !scene || !episode || episode.project_id !== projectId)
    throw new Error("Scene is missing from this project.");
  if (
    !(graph.document.languages ?? [graph.document.defaultLanguage]).includes(
      language,
    )
  )
    throw new Error("Choose a story language first.");
  const contentHash = await storyHash({
    graphId,
    nodeId,
    language,
    content: node.content ?? null,
  });
  return store.command(() => {
    if (store.find("story_graphs", graphId)?.revision !== expectedGraphRevision)
      throw new Error("Story changed while opening the editor.");
    const cuts = store
      .rows("timelines")
      .filter(
        (t) =>
          ((t.story_graph_id === graphId &&
            t.story_node_id === nodeId &&
            t.story_language === language) ||
            (t.meta?.archived_story?.graphId === graphId &&
              t.meta.archived_story.nodeId === nodeId &&
              t.meta.archived_story.language === language)) &&
          !t.production_unit_id,
      );
    const current = cuts.find((t) => t.story_graph_id === graphId);
    const existing = timelineId ? store.find("timelines", timelineId) : current ?? cuts[0];
    if (timelineId && (!existing || !availableStorySceneTimelines(store, graphId, nodeId, language).some((t) => t.id === timelineId)))
      throw new Error("Choose an editable timeline from this scene's episode. Timelines linked to other scenes or languages cannot be reused.");
    if (current && existing && current.id !== existing.id) {
      store.update("timelines", [current], {
        story_graph_id: null, story_node_id: null, story_language: null, story_content_hash: null,
        meta: { ...current.meta, archived_story: {
          graphId, nodeId, language, contentHash: current.story_content_hash,
        } },
      });
    }
    const timeline = existing
      ? store.update("timelines", [existing], {
          story_content_hash: contentHash,
          story_graph_id: graphId,
          story_node_id: nodeId,
          story_language: language,
          meta: { ...existing.meta, archived_story: null },
        })[0]
      : store.insert("timelines", [
          {
            episode_id: episode.id,
            name: `${scene.slug} · ${language}`,
            fps: 24,
            width: 1280,
            height: 720,
            story_graph_id: graphId,
            story_node_id: nodeId,
            story_language: language,
            story_content_hash: contentHash,
          },
        ])[0];
    if (!existing)
      store.insert("tracks", [
        { timeline_id: timeline.id, kind: "video", idx: 0, name: "V1" },
        ...["Dialogue", "Music", "Ambience", "SFX"].map((name, idx) => ({
          timeline_id: timeline.id,
          kind: "audio",
          idx,
          name,
        })),
      ]);
    return {
      timelineId: timeline.id,
      sceneId: scene.id,
      episodeId: episode.id,
      contentHash,
      href: `/project/${projectId}/ep/${episode.id}/timeline?timeline=${timeline.id}&story=${graphId}&node=${nodeId}&lang=${encodeURIComponent(language)}`,
    };
  });
}

/** Existing editable cuts that can be linked without changing another scene. */
export function availableStorySceneTimelines(store: LocalStore, graphId: string, nodeId: string, language: string) {
  const graph = store.find("story_graphs", graphId);
  const node = graph?.document.nodes.find((n: any) => n.id === nodeId && n.type === "scene");
  const scene = node && store.find("scenes", node.sceneId);
  const board = scene && store.find("storyboards", scene.storyboard_id);
  if (!board || graph?.project_id !== store.projectId) return [];
  return store.rows("timelines").filter((t) => {
    if (t.episode_id !== board.episode_id || t.production_unit_id) return false;
    if (t.story_graph_id) return t.story_graph_id === graphId && t.story_node_id === nodeId && t.story_language === language;
    const archived = t.meta?.archived_story;
    return !archived || (archived.graphId === graphId && archived.nodeId === nodeId && archived.language === language);
  });
}
