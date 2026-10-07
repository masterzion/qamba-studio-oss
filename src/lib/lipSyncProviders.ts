export const LOCAL_LIP_SYNC = {
  id: "latentsync-1.5",
  workflow: "lipsync_latentsync.json",
  requiredNodes: [
    "LoadVideo",
    "GetVideoComponents",
    "LoadAudio",
    "VideoLengthAdjuster",
    "LatentSyncNode",
    "CreateVideo",
    "SaveVideo",
  ],
  requiresProvisioning: true,
};
export function lipSyncPayload(input: {
  videoAssetId: string;
  dialogueAssetId: string;
  speakerRootId: string;
  startMs: number;
  endMs: number;
  productionUnitId: string;
  inputHash: string;
  modelFiles: { path: string; sha256: string }[];
}) {
  if (
    !input.videoAssetId ||
    !input.dialogueAssetId ||
    !input.speakerRootId ||
    !input.productionUnitId ||
    !input.inputHash ||
    !Number.isInteger(input.startMs) ||
    !Number.isInteger(input.endMs) ||
    input.startMs < 0 ||
    input.endMs <= input.startMs ||
    !input.modelFiles.length
  )
    throw new Error(
      "Lip-sync requires final video/dialogue, speaker, unit, integer segment bounds and provisioned model checksums",
    );
  return {
    provider: LOCAL_LIP_SYNC.id,
    workflow_id: LOCAL_LIP_SYNC.workflow,
    video_asset_id: input.videoAssetId,
    dialogue_asset_id: input.dialogueAssetId,
    speaker_root_id: input.speakerRootId,
    start_ms: input.startMs,
    end_ms: input.endMs,
    production_unit_id: input.productionUnitId,
    input_hash: input.inputHash,
    model_files: input.modelFiles,
  };
}
