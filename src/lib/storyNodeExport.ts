import { localMediaPath } from "./localMediaPath.ts";
import type { LocalStore } from "./localStore";
import type { StoryGraph, StoryNode } from "./storyTypes";

export const STORY_NODE_EXPORT_FORMAT = "qamba-story-graph";
export const STORY_NODE_EXPORT_VERSION = 1;

export interface ExportedRenderedVideo {
  productionUnitId: string;
  assetId: string;
  /** A local filesystem path when the project media root is available. */
  filePath: string;
  /** The project media key, useful when the local file is not present. */
  assetKey: string;
  contentType: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
}

export type ExportedStoryNode = StoryNode & {
  finalRenderedVideoPath: string | null;
  finalRenderedVideoPaths: string[];
  finalRenderedVideos: ExportedRenderedVideo[];
};

export interface StoryNodeExport {
  format: typeof STORY_NODE_EXPORT_FORMAT;
  formatVersion: typeof STORY_NODE_EXPORT_VERSION;
  exportedAt: string;
  projectId: string;
  storyId: string;
  title: string;
  revision: number;
  schemaVersion: number;
  engineVersion: string;
  entryNodeId: string;
  defaultLanguage: string;
  languages?: string[];
  nodes: ExportedStoryNode[];
  edges: StoryGraph["document"]["edges"];
  stateDefinitions: StoryGraph["document"]["stateDefinitions"];
  initialState: StoryGraph["document"]["initialState"];
  editor: StoryGraph["document"]["editor"];
  metadata: StoryGraph["document"]["metadata"];
}

function videoOutputsForNode(
  graph: StoryGraph,
  store: LocalStore,
  nodeId: string,
): ExportedRenderedVideo[] {
  return store
    .rows("production_units")
    .filter(
      (unit) =>
        unit.graph_id === graph.id &&
        unit.graph_revision === graph.revision &&
        unit.node_id === nodeId &&
        unit.status === "approved" &&
        typeof unit.approved_asset_id === "string",
    )
    .flatMap((unit) => {
      const asset = store.find("assets", unit.approved_asset_id);
      if (!asset || asset.deleted_at || asset.kind !== "video") return [];
      const filePath = localMediaPath(graph.project_id, asset.b2_key) ?? asset.b2_key;
      return [
        {
          productionUnitId: unit.id,
          assetId: asset.id,
          filePath,
          assetKey: asset.b2_key,
          contentType: asset.content_type ?? null,
          durationMs: asset.duration_ms ?? null,
          width: asset.width ?? null,
          height: asset.height ?? null,
          fps: asset.fps ?? null,
        },
      ];
    });
}

export function buildStoryNodeExport(
  graph: StoryGraph,
  store: LocalStore,
  exportedAt = new Date().toISOString(),
): StoryNodeExport {
  const nodes = graph.document.nodes.map((node) => {
    const finalRenderedVideos = videoOutputsForNode(graph, store, node.id);
    return {
      ...structuredClone(node),
      finalRenderedVideoPath: finalRenderedVideos[0]?.filePath ?? null,
      finalRenderedVideoPaths: finalRenderedVideos.map((video) => video.filePath),
      finalRenderedVideos,
    };
  });

  return {
    format: STORY_NODE_EXPORT_FORMAT,
    formatVersion: STORY_NODE_EXPORT_VERSION,
    exportedAt,
    projectId: graph.project_id,
    storyId: graph.id,
    title: graph.title,
    revision: graph.revision,
    schemaVersion: graph.document.schemaVersion,
    engineVersion: graph.document.engineVersion,
    entryNodeId: graph.document.entryNodeId,
    defaultLanguage: graph.document.defaultLanguage,
    ...(graph.document.schemaVersion === 2
      ? { languages: [...graph.document.languages] }
      : {}),
    nodes,
    edges: structuredClone(graph.document.edges),
    stateDefinitions: structuredClone(graph.document.stateDefinitions),
    initialState: structuredClone(graph.document.initialState),
    editor: structuredClone(graph.document.editor),
    metadata: structuredClone(graph.document.metadata),
  };
}

export function storyNodeExportFileName(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeTitle || "story-graph"}.json`;
}
