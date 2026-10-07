import type { GraphDocument } from "./storyTypes.ts";
export function estimateStoryCost(
  graph: GraphDocument,
  scenes: any[],
  beats: any[],
  units: any[] = [],
  candidates = 2,
) {
  const sceneIds = new Set(
    graph.nodes.filter((n) => n.type === "scene").map((n) => n.sceneId),
  );
  const shots = beats.filter((b) => sceneIds.has(b.scene_id));
  const approved = new Set(
    units.filter((u) => u.status === "approved").map((u) => u.context_hash),
  );
  return {
    uniqueSceneBlueprints: sceneIds.size,
    knownProductionVariants: new Set(units.map((u) => u.context_hash)).size,
    approvedVariants: approved.size,
    images: shots.length * Math.max(1, candidates),
    videoSegments: shots.reduce(
      (n, b) => n + Math.max(1, Math.ceil(b.duration_ms / 5000)),
      0,
    ),
    dialogueClips: shots.reduce((n, b) => n + (b.dialogue?.length ?? 0), 0),
    audioClips: shots.filter((b) => b.sfx).length,
    estimatedGPUSeconds: null,
    note: "Workload estimate; unconfigured branch variants and retries are not yet measured",
  };
}
