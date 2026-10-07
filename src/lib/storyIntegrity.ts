import { StoryError, canonicalJSON } from "../../director/story_runtime.js";
import type { LocalStore, Row } from "./localStore.ts";
export function guardProductionWrite(
  store: LocalStore,
  table: string,
  next: Row,
  previous?: Row,
  humanReview = false,
) {
  if (
    table === "timelines" &&
    previous?.story_graph_id &&
    !next.story_graph_id
  ) {
    const archived = next.meta?.archived_story;
    if (
      archived?.graphId !== previous.story_graph_id ||
      archived?.nodeId !== previous.story_node_id ||
      archived?.language !== previous.story_language ||
      archived?.contentHash !== previous.story_content_hash ||
      ["story_node_id", "story_language", "story_content_hash"].some(
        (k) => next[k] != null,
      )
    )
      throw new StoryError(
        "STORY_TIMELINE_CONTEXT",
        "Retain the story cut's original binding when archiving it.",
      );
  }
  if (table === "timelines" && next.story_graph_id) {
    const graph = store.find("story_graphs", next.story_graph_id),
      node = graph?.document.nodes.find(
        (n: any) => n.id === next.story_node_id && n.type === "scene",
      );
    const scene = node && store.find("scenes", node.sceneId),
      board = scene && store.find("storyboards", scene.storyboard_id);
    if (
      !graph ||
      graph.project_id !== store.projectId ||
      !node ||
      !board ||
      board.episode_id !== next.episode_id ||
      !(graph.document.languages ?? [graph.document.defaultLanguage]).includes(
        next.story_language,
      ) ||
      !/^[0-9a-f]{64}$/.test(next.story_content_hash ?? "")
    )
      throw new StoryError(
        "STORY_TIMELINE_CONTEXT",
        "Story cut must belong to a scene and language in this project.",
      );
    if (
      previous?.story_graph_id &&
      ["story_graph_id", "story_node_id", "story_language"].some(
        (k) => previous[k] !== next[k],
      )
    )
      throw new StoryError(
        "STORY_TIMELINE_CONTEXT",
        "Create a separate cut for another story scene or language.",
      );
    if (
      previous?.meta?.archived_story &&
      ["graphId", "nodeId", "language"].some(
        (k, i) =>
          previous.meta.archived_story[k] !==
          next[["story_graph_id", "story_node_id", "story_language"][i]],
      )
    )
      throw new StoryError(
        "STORY_TIMELINE_CONTEXT",
        "An archived cut can only return to its original story scene and language.",
      );
    if (
      !next.production_unit_id &&
      store
        .rows("timelines")
        .some(
          (t) =>
            t.id !== next.id &&
            !t.production_unit_id &&
            t.story_graph_id === next.story_graph_id &&
            t.story_node_id === next.story_node_id &&
            t.story_language === next.story_language,
        )
    )
      throw new StoryError(
        "STORY_TIMELINE_CONTEXT",
        "This story scene already has a draft cut in this language.",
      );
  }
  if (table === "jobs") {
    const project = store.find("projects", store.projectId);
    if (project?.settings?.offline_only && next.kind === "byok_gen")
      throw new StoryError(
        "STORY_OFFLINE_POLICY",
        "Hosted generation is disabled by this project's offline policy",
      );
    if (
      project?.settings?.narrative_mode === "interactive" &&
      next.kind === "launch_render" &&
      !next.payload?.production_unit_id
    )
      throw new StoryError(
        "STORY_INVALID_UNIT",
        "Interactive scene renders require a captured production unit",
      );
  }
  if (
    table === "bible_entries" &&
    next.doc?.canonical?.approval === "approved" &&
    canonicalJSON(previous?.doc?.canonical ?? null) !==
      canonicalJSON(next.doc.canonical) &&
    !humanReview
  )
    throw new StoryError(
      "STORY_HUMAN_APPROVAL",
      "Canonical identity approval requires human review",
    );
  if (table === "production_units") {
    if (
      canonicalJSON(next.subtitle_document ?? {}) !==
        canonicalJSON(previous?.subtitle_document ?? {}) &&
      next.subtitle_document?.status === "approved" &&
      !humanReview
    )
      throw new StoryError(
        "STORY_HUMAN_APPROVAL",
        "Subtitle approval requires a human timing review",
      );
    if (
      previous &&
      next.status === "stale" &&
      canonicalJSON({ ...previous, status: "stale" }) === canonicalJSON(next)
    )
      return;
    const graph = store.find("story_graphs", next.graph_id),
      scene = store.find("scenes", next.scene_id),
      context = next.context;
    if (
      !graph ||
      !scene ||
      scene.storyboard_id !== next.storyboard_id ||
      !graph.document.nodes.some(
        (n: any) => n.id === next.node_id && n.sceneId === next.scene_id,
      ) ||
      ![1, 2].includes(context?.schemaVersion) ||
      context.graphId !== next.graph_id ||
      context.sceneId !== next.scene_id ||
      context.nodeId !== next.node_id ||
      context.graphRevision !== next.graph_revision ||
      context.inputHash !== next.context_hash ||
      !/^[0-9a-f]{64}$/.test(next.context_hash)
    )
      throw new StoryError(
        "STORY_INVALID_UNIT",
        "Production units require a valid captured project context",
      );
    if (context.schemaVersion === 2) {
      const authored = context.productionSettings?.storyContent;
      if (
        !authored ||
        authored.nodeId !== next.node_id ||
        !graph.document.languages?.includes(authored.language) ||
        authored.language !== context.productionSettings.language ||
        !Array.isArray(authored.dialogue) ||
        !Array.isArray(context.productionSettings.projectedBeats) ||
        !/^[0-9a-f]{64}$/.test(authored.contentHash)
      )
        throw new StoryError(
          "STORY_INVALID_UNIT",
          "Version 2 production requires captured localized dialogue and shot projections",
        );
    }
    if (
      previous &&
      canonicalJSON({
        ...previous.context,
        graphRevision: next.graph_revision,
      }) !== canonicalJSON(next.context)
    )
      throw new StoryError(
        "STORY_CONTEXT_IMMUTABLE",
        "Capture a new production unit when inputs change",
      );
    if (
      next.status === "approved" &&
      previous?.status !== "approved" &&
      !humanReview
    )
      throw new StoryError(
        "STORY_HUMAN_APPROVAL",
        "Only a human playback review can approve media",
      );
  }
  if (
    ["generation_blocks", "timelines"].includes(table) &&
    next.production_unit_id
  ) {
    const unit = store.find("production_units", next.production_unit_id);
    const board = store.find("storyboards", unit?.storyboard_id);
    if (
      !unit ||
      (table === "generation_blocks" &&
        (next.storyboard_id !== unit.storyboard_id ||
          next.scene_ids?.some((id: string) => id !== unit.scene_id))) ||
      (table === "timelines" && next.episode_id !== board?.episode_id)
    )
      throw new StoryError(
        "STORY_INVALID_UNIT",
        "Media must remain inside its captured production unit",
      );
    if (
      table === "generation_blocks" &&
      store
        .rows(table)
        .some(
          (r) =>
            r.id !== next.id &&
            r.storyboard_id === next.storyboard_id &&
            r.production_unit_id === next.production_unit_id &&
            r.idx === next.idx,
        )
    )
      throw new StoryError(
        "STORY_BLOCK_INDEX",
        "Block indices must be unique within a production unit",
      );
  }
  if (
    table === "assets" &&
    (next.meta?.production_unit_id ||
      next.meta?.presentation ||
      next.meta?.canonicalPlate ||
      next.meta?.dialogue) &&
    next.meta?.review?.status === "approved" &&
    !humanReview
  ) {
    if (previous?.meta?.review?.status !== "approved")
      throw new StoryError(
        "STORY_HUMAN_APPROVAL",
        "AI generation cannot approve its own media",
      );
    const protectedFields = (row: Row) => ({
      b2_key: row.b2_key,
      meta: row.meta,
      duration_ms: row.duration_ms,
      width: row.width,
      height: row.height,
      fps: row.fps,
    });
    if (
      canonicalJSON(protectedFields(previous)) !==
      canonicalJSON(protectedFields(next))
    )
      throw new StoryError(
        "STORY_HUMAN_APPROVAL",
        "Changed approved media requires another human review",
      );
  }
}
export function invalidateStoryInputs(
  store: LocalStore,
  table: string,
  changed: Row[],
) {
  if (
    ![
      "scenes",
      "beats",
      "bible_entries",
      "bible_assets",
      "assets",
      "historical_sources",
    ].includes(table)
  )
    return;
  const ids = new Set(changed.map((r) => r.id ?? r.asset_id));
  const sceneIds = new Set(
    changed.map((r) => (table === "beats" ? r.scene_id : r.id)),
  );
  const units = store
    .rows("production_units")
    .filter(
      (u) =>
        u.status !== "stale" &&
        ((["scenes", "beats"].includes(table) && sceneIds.has(u.scene_id)) ||
          (table === "historical_sources" &&
            u.context?.historicalRefs?.some((r: any) => ids.has(r.sourceId))) ||
          (table === "bible_entries" &&
            u.context?.canonicalSelections?.some(
              (s: any) => ids.has(s.rootEntryId) || ids.has(s.variantEntryId),
            )) ||
          (["assets", "bible_assets"].includes(table) &&
            u.context?.canonicalSelections?.some((s: any) =>
              s.assetIds.some((id: string) => ids.has(id)),
            ))),
    );
  if (units.length)
    store.update("production_units", units, { status: "stale" });
}
export function invalidateUnitTake(store: LocalStore, blocks: Row[]): void {
  for (const block of blocks.filter((b) => b.production_unit_id)) {
    const unit = store.find("production_units", block.production_unit_id);
    if (unit && unit.status !== "stale")
      store.update("production_units", [unit], {
        status: "draft",
        approved_asset_id: null,
      });
    const frontier = [block.id],
      seen = new Set<string>();
    while (frontier.length) {
      const id = frontier.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const child of store
        .rows("generation_blocks")
        .filter((b) => b.chain_from_block_id === id)) {
        store.update("generation_blocks", [child], { status: "stale" });
        const dependent = store.find(
          "production_units",
          child.production_unit_id,
        );
        if (dependent && dependent.id !== unit?.id)
          store.update("production_units", [dependent], { status: "stale" });
        frontier.push(child.id);
      }
    }
    store.update(
      "timelines",
      store.rows("timelines").filter((t) => t.production_unit_id === unit?.id),
      { render_stale: true },
    );
  }
}
export function invalidateUnitCut(
  store: LocalStore,
  table: string,
  rows: Row[],
): void {
  if (!["clips", "tracks"].includes(table)) return;
  const ids = new Set(
    rows.map((r) =>
      table === "tracks"
        ? r.timeline_id
        : store.find("tracks", r.track_id)?.timeline_id,
    ),
  );
  for (const timeline of store
    .rows("timelines")
    .filter((t) => ids.has(t.id) && t.production_unit_id)) {
    const unit = store.find("production_units", timeline.production_unit_id);
    if (unit && unit.status !== "stale")
      store.update("production_units", [unit], {
        status: "draft",
        approved_asset_id: null,
      });
    store.update("timelines", [timeline], { render_stale: true });
  }
}
