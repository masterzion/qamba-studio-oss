import { localMediaPath } from "./localMediaPath.ts";

interface SoundtrackAsset {
  kind: string;
  b2_key: string;
  deleted_at?: string | null;
}

/** Metadata only: never creates clips or changes playback. */
export function addSoundtrackPaths(
  paths: readonly string[], projectId: string, assets: readonly SoundtrackAsset[],
): string[] {
  return [...new Set([...paths, ...assets
    .filter((asset) => asset.kind === "audio" && !asset.deleted_at && asset.b2_key)
    .map((asset) => localMediaPath(projectId, asset.b2_key) ?? asset.b2_key)])];
}
