import type { LocalStore, Row } from "./localStore.ts";
export async function queueUnitRender(
  store: LocalStore,
  unit: Row,
  enqueue: (job: any) => Promise<any>,
) {
  const graph = store.find("story_graphs", unit.graph_id),
    context = unit.context;
  if (
    !graph ||
    graph.revision !== unit.graph_revision ||
    unit.status === "stale" ||
    !context?.productionSettings?.model_key
  )
    throw new Error(
      "Capture current production inputs and select an installed model",
    );
  const existing = store
    .rows("jobs")
    .find(
      (j) =>
        ["queued", "running", "generating"].includes(j.status) &&
        j.kind === "launch_render" &&
        j.payload?.production_unit_id === unit.id &&
        j.payload?.input_hash === unit.context_hash,
    );
  if (existing) return structuredClone(existing);
  const { desktopRenderModels } = await import("./desktopPlanner");
  const model = (await desktopRenderModels()).find(
    (m) => m.kind === "video" && m.key === context.productionSettings.model_key,
  );
  const mode = context.productionSettings.videoMode ?? "r2v";
  if (!model?.ready || !model.modes.includes(mode))
    throw new Error(
      `Provision the selected desktop ${mode} video model first: ${model?.missing?.join(", ") ?? context.productionSettings.model_key}`,
    );
  const job = await enqueue({
    kind: "launch_render",
    lane: "local",
    project_id: store.projectId,
    payload: {
      storyboard_id: unit.storyboard_id,
      production_unit_id: unit.id,
      input_hash: unit.context_hash,
      model_key: context.productionSettings.model_key,
      production_context: context,
      auto_activate: false,
      params: { el_dialogue: false, dialogue_spine: false },
      lanes: {
        master_pass: "local",
        audio_slice: "local",
        assemble_take: "local",
        assemble_cut: "local",
        tts: "local",
      },
    },
  });
  store.update("production_units", [unit], { status: "queued" });
  return job;
}
