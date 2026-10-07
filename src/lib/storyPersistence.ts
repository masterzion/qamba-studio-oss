import {
  StoryError,
  validateGraph,
  canonicalJSON,
} from "../../director/story_runtime.js";
import type { LocalStore } from "./localStore.ts";
import type { GraphDocument, StoryGraph } from "./storyTypes.ts";
export function assertGraphReferences(
  store: LocalStore,
  document: GraphDocument,
): void {
  for (const n of document.nodes) {
    for (const line of n.content?.dialogue ?? [])
      if (line.speakerId !== null) {
        const speaker = store.find("bible_entries", line.speakerId);
        if (
          !speaker ||
          speaker.project_id !== store.projectId ||
          speaker.kind !== "character"
        )
          throw new StoryError(
            "STORY_INVALID_SPEAKER",
            "Dialogue speaker must be a character in this project",
          );
      }
    if (n.type === "scene") {
      const scene = store.find("scenes", n.sceneId!);
      const board = scene && store.find("storyboards", scene.storyboard_id);
      const episode = board && store.find("episodes", board.episode_id);
      if (!episode || episode.project_id !== store.projectId)
        throw new StoryError(
          "STORY_INVALID_SCENE",
          `Scene ${n.sceneId} does not belong to this project`,
        );
    }
    if (n.type === "historical_event") {
      const entry = store.find("bible_entries", n.historicalEntryId!);
      if (
        !entry ||
        entry.project_id !== store.projectId ||
        !entry.doc?.historical
      )
        throw new StoryError(
          "STORY_INVALID_HISTORY",
          "Historical event must reference a project historical record",
        );
    }
    for (const ref of [
      ...n.sourceRefs,
      ...(n.choices ?? []).flatMap((c) => c.sourceRefs),
    ]) {
      const source = store.find("historical_sources", ref.sourceId);
      if (!source || source.project_id !== store.projectId)
        throw new StoryError(
          "STORY_INVALID_SOURCE",
          "Citation source does not belong to this project",
        );
    }
  }
}
export function saveGraphInStore(
  store: LocalStore,
  args: {
    graph_id?: string;
    expected_revision: number;
    document: GraphDocument;
    reason?: string;
    title?: string;
  },
  afterSave?: () => void,
  beforeSave?: () => void,
): StoryGraph {
  return store.command(() => {
    beforeSave?.();
    const result = validateGraph(args.document);
    if (!result.ok)
      throw new StoryError(
        "STORY_INVALID_GRAPH",
        result.errors[0].message,
        result.errors,
      );
    assertGraphReferences(store, args.document);
    for (const timeline of store
      .rows("timelines")
      .filter((t) => t.story_graph_id === args.graph_id)) {
      if (
        !args.document.nodes.some(
          (n) => n.id === timeline.story_node_id && n.type === "scene",
        )
      )
        store.update("timelines",[timeline],{
          story_graph_id:null,story_node_id:null,story_language:null,story_content_hash:null,
          meta:{...timeline.meta,archived_story:{graphId:timeline.story_graph_id,nodeId:timeline.story_node_id,language:timeline.story_language,contentHash:timeline.story_content_hash}},
        });
    }
    const previous = args.graph_id
      ? store.find("story_graphs", args.graph_id)
      : undefined;
    if (
      (previous?.revision ?? 0) !== args.expected_revision ||
      (args.graph_id && !previous)
    )
      throw new StoryError(
        "STORY_REVISION_CONFLICT",
        "Story changed; reload before saving",
      );
    let graph: Record<string, any>;
    if (previous) {
      const previousDocument = structuredClone(previous.document);
      store.insert("story_graph_revisions", [
        {
          graph_id: previous.id,
          revision: previous.revision,
          document: previous.document,
          reason: args.reason ?? "Edit story",
        },
      ]);
      graph = store.update("story_graphs", [previous], {
        document: args.document,
        schema_version: args.document.schemaVersion,
        revision: previous.revision + 1,
        title: args.title ?? previous.title,
        status: "draft",
      })[0];
      store.remove(
        "story_graph_scene_refs",
        store
          .rows("story_graph_scene_refs")
          .filter((r) => r.graph_id === previous.id),
      );
      const semantic = (d: GraphDocument) => {
        const { editor, metadata, ...runtime } = d;
        return canonicalJSON(runtime);
      };
      const unchanged = semantic(previousDocument) === semantic(args.document);
      for (const unit of store
        .rows("production_units")
        .filter((r) => r.graph_id === graph.id)) {
        if (unchanged && unit.graph_revision === args.expected_revision)
          store.update("production_units", [unit], {
            graph_revision: graph.revision,
            context: { ...unit.context, graphRevision: graph.revision },
          });
        else if (!unchanged)
          store.update("production_units", [unit], { status: "stale" });
      }
    } else
      graph = store.insert("story_graphs", [
        {
          project_id: store.projectId,
          title: args.title ?? "Interactive story",
          document: args.document,
          schema_version: args.document.schemaVersion,
        },
      ])[0];
    const sceneIds = [
      ...new Set(
        args.document.nodes
          .filter((n) => n.type === "scene")
          .map((n) => n.sceneId!),
      ),
    ];
    store.insert(
      "story_graph_scene_refs",
      sceneIds.map((scene_id) => ({ graph_id: graph.id, scene_id })),
    );
    afterSave?.();
    return JSON.parse(JSON.stringify(graph));
  });
}
export function deleteGraphInStore(
  store: LocalStore,
  id: string,
  expectedRevision: number,
): void {
  store.command(() => {
    const graph = store.find("story_graphs", id);
    if (!graph || graph.revision !== expectedRevision)
      throw new StoryError(
        "STORY_REVISION_CONFLICT",
        "Story changed; reload before deleting",
      );
    store.remove("story_graphs", [graph]);
  });
}
