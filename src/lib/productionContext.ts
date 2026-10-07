import {
  replaySession,
  canonicalJSON,
  evaluateCondition,
  StoryError,
  resolveText,
} from "../../director/story_runtime.js";
import { storyHash } from "./storyHash.ts";
import type { LocalStore } from "./localStore.ts";
import type { CitationRef, GameState, StoryGraph } from "./storyTypes.ts";
export interface CanonicalSelection {
  rootEntryId: string;
  variantEntryId: string;
  assetIds: string[];
  revision: number;
}
export interface ProductionContext {
  schemaVersion: 1 | 2;
  graphId: string;
  graphRevision: number;
  nodeId: string;
  sceneId: string;
  edgeHistory: string[];
  stateHash: string;
  effectiveState: GameState;
  visualSignature: Record<string, unknown>;
  canonicalSelections: CanonicalSelection[];
  canonicalRevisionHashes: Record<string, string>;
  historicalRefs: CitationRef[];
  historicalRevisionHashes: Record<string, string>;
  predecessor: {
    unitId: string;
    blockId: string;
    takeId: string;
    assetId: string;
  } | null;
  successorOpening: Record<string, unknown> | null;
  productionSettings: Record<string, unknown>;
  inputHash: string;
}
export async function captureProductionContext(
  store: LocalStore,
  graph: StoryGraph,
  edgeHistory: string[],
  input: {
    visualSignature: Record<string, unknown>;
    canonicalSelections: CanonicalSelection[];
    productionSettings: Record<string, unknown>;
    predecessor?: ProductionContext["predecessor"];
    successorOpening?: ProductionContext["successorOpening"];
  },
): Promise<ProductionContext> {
  const captureRevision = store.revision;
  const live = store.find("story_graphs", graph.id);
  if (!live || live.revision !== graph.revision)
    throw new StoryError(
      "STORY_REVISION_CONFLICT",
      "Reload the graph before capturing production",
    );
  const session = replaySession(graph, undefined, undefined, edgeHistory);
  const node = graph.document.nodes.find(
    (n) => n.id === session.currentNodeId,
  )!;
  if (node.type !== "scene")
    throw new StoryError(
      "STORY_NOT_SCENE",
      "Production requires a simulated scene node",
    );
  const scene = store.find("scenes", node.sceneId!);
  if (!scene)
    throw new StoryError("STORY_INVALID_SCENE", "The bound scene is missing");
  const selectedRoots = new Set(
    input.canonicalSelections.map((s) => s.rootEntryId),
  );
  if (selectedRoots.size !== input.canonicalSelections.length)
    throw new StoryError(
      "STORY_VARIANT_AMBIGUOUS",
      "Choose exactly one variant per canonical identity",
    );
  for (const id of [
    ...(scene.cast_ids ?? []),
    ...(scene.environment_id ? [scene.environment_id] : []),
  ]) {
    const entry = store.find("bible_entries", id),
      rootId = entry?.doc?.canonical?.rootEntryId ?? id;
    if (!selectedRoots.has(rootId))
      throw new StoryError(
        "STORY_CANONICAL_INPUT",
        "Select approved canonical inputs for every scene character and environment",
      );
  }
  const canonicalRevisionHashes: Record<string, string> = {};
  for (const selection of input.canonicalSelections) {
    const root = store.find("bible_entries", selection.rootEntryId),
      variant = store.find("bible_entries", selection.variantEntryId);
    if (
      !root ||
      !variant ||
      root.doc?.canonical?.approval !== "approved" ||
      variant.doc?.canonical?.rootEntryId !== root.id ||
      variant.doc.canonical.revision !== selection.revision ||
      variant.doc.canonical.approval !== "approved"
    )
      throw new StoryError(
        "STORY_CANONICAL_INPUT",
        "Select current approved canonical variants",
      );
    const matches = (root.doc?.canonical?.variantRules ?? []).filter(
      (r: any) =>
        (!r.graphId || r.graphId === graph.id) &&
        evaluateCondition(
          r.condition,
          session.state,
          graph.document.stateDefinitions,
        ).ok,
    );
    if (
      matches.length > 1 ||
      (matches.length &&
        !matches.some((r: any) => r.variantEntryId === variant.id))
    )
      throw new StoryError(
        "STORY_VARIANT_STATE",
        "Selected variant does not match the simulated state",
      );
    for (const id of selection.assetIds) {
      const asset = store.find("assets", id);
      if (
        !asset ||
        !/^[0-9a-f]{64}$/.test(asset.meta?.review?.mediaHash ?? "") ||
        asset.project_id !== store.projectId ||
        asset.meta?.review?.status !== "approved" ||
        asset.deleted_at
      )
        throw new StoryError(
          "STORY_CANONICAL_INPUT",
          "Every input plate must exist and have human approval",
        );
    }
    if (!selection.assetIds.length)
      throw new StoryError(
        "STORY_CANONICAL_INPUT",
        "Canonical selections require approved plates",
      );
    canonicalRevisionHashes[selection.variantEntryId] = await storyHash({
      root,
      variant,
      assets: selection.assetIds.map((id) => store.find("assets", id)),
    });
  }
  const visited = graph.document.nodes.filter((n) =>
    session.visitedNodes.includes(n.id),
  );
  const historicalRefs = [
    ...visited.flatMap((n) => n.sourceRefs),
    ...visited.flatMap(
      (n) =>
        n.choices
          ?.filter((c) =>
            edgeHistory.some((id) =>
              graph.document.edges.some(
                (e) => e.id === id && e.sourcePort === c.id,
              ),
            ),
          )
          .flatMap((c) => c.sourceRefs) ?? [],
    ),
    ...visited
      .filter((n) => n.type === "historical_event")
      .flatMap(
        (n) =>
          store.find("bible_entries", n.historicalEntryId!)?.doc?.historical
            ?.sourceRefs ?? [],
      ),
    ...(scene.meta?.sourceRefs ?? []),
  ];
  const historicalRevisionHashes: Record<string, string> = {};
  for (const ref of historicalRefs) {
    const source = store.find("historical_sources", ref.sourceId);
    if (!source)
      throw new StoryError(
        "STORY_INVALID_SOURCE",
        "An input citation is missing",
      );
    historicalRevisionHashes[source.id] = await storyHash(source);
  }
  if (input.predecessor) {
    const p = input.predecessor,
      unit = store.find("production_units", p.unitId),
      block = store.find("generation_blocks", p.blockId),
      take = store.find("block_takes", p.takeId);
    if (
      !unit ||
      !block ||
      !take ||
      unit.graph_id !== graph.id ||
      unit.graph_revision !== graph.revision ||
      unit.status !== "approved" ||
      block.production_unit_id !== unit.id ||
      take.block_id !== block.id ||
      take.asset_id !== p.assetId
    )
      throw new StoryError(
        "STORY_PREDECESSOR",
        "Continuity requires the exact approved predecessor unit, block, take and asset",
      );
  }
  const beats = store
    .rows("beats")
    .filter((b) => b.scene_id === scene.id)
    .sort((a, b) => a.idx - b.idx);
  const visualSignature = structuredClone(input.visualSignature);
  // Root identities and state-dependent injuries are always part of presentation inputs.
  visualSignature.characters = session.state.characters ?? {};
  visualSignature.injured = session.state.flags?.injured ?? false;
  visualSignature.location = session.state.location ?? null;
  visualSignature.historicalTime = session.state.world?.historicalTime ?? null;
  const productionSettings = structuredClone(input.productionSettings);
  if (node.content) {
    const language=String(productionSettings.language ?? graph.document.defaultLanguage);
    if (!graph.document.languages?.includes(language)) throw new StoryError("STORY_LANGUAGE","Choose a declared story language");
    const dialogue=node.content.dialogue.map(line=>{
      if (!line.text[language]?.trim()) throw new StoryError("STORY_TRANSLATION",`Translate dialogue line ${line.id} into ${language} before production`);
      return {id:line.id,speaker_id:line.speakerId,line:line.text[language],delivery:resolveText(line.delivery,language,graph.document.defaultLanguage),language,emotion:line.emotion,intensity:line.intensity,pace:line.pace,offscreen:line.offscreen};
    });
    productionSettings.language=language;
    productionSettings.storyContent={nodeId:node.id,language,content:structuredClone(node.content),dialogue,contentHash:await storyHash(node.content)};
    productionSettings.projectedBeats=beats.map((b,i)=>({...structuredClone(b),dialogue:i===0?dialogue:[],action:i===0?resolveText(node.content!.visualPrompt,language,graph.document.defaultLanguage)||b.action:b.action,meta:{...b.meta,story_node_id:node.id,story_language:language}}));
    if (!beats.length) throw new StoryError("STORY_SHOTS","Add at least one authored shot before production");
  }
  const compositionHashes: Record<string, string> = {};
  const compositionIds = productionSettings.compositionAssetIds ?? [];
  if (
    !Array.isArray(compositionIds) ||
    compositionIds.some((id) => typeof id !== "string")
  )
    throw new StoryError(
      "STORY_COMPOSITION_INPUT",
      "Composition asset IDs must be an array of UUIDs",
    );
  const videoMode = productionSettings.videoMode ?? "r2v";
  if (
    !["r2v", "flf"].includes(String(videoMode)) ||
    (videoMode === "flf" && (beats.length !== 1 || compositionIds.length !== 2))
  )
    throw new StoryError(
      "STORY_COMPOSITION_INPUT",
      "First/last-frame conditioning requires one authored shot and exactly two approved ordered composition frames",
    );
  for (const id of compositionIds) {
    const asset = store.find("assets", id),
      sourceUnit =
        asset && store.find("production_units", asset.meta?.production_unit_id);
    if (
      !asset ||
      asset.meta?.review?.status !== "approved" ||
      !/^[0-9a-f]{64}$/.test(asset.meta?.review?.mediaHash ?? "") ||
      !sourceUnit ||
      sourceUnit.status === "stale" ||
      sourceUnit.graph_id !== graph.id ||
      sourceUnit.graph_revision !== graph.revision ||
      sourceUnit.node_id !== node.id ||
      canonicalJSON(sourceUnit.context.visualSignature) !==
        canonicalJSON(visualSignature) ||
      canonicalJSON(sourceUnit.context.canonicalRevisionHashes ?? {}) !==
        canonicalJSON(canonicalRevisionHashes)
    )
      throw new StoryError(
        "STORY_COMPOSITION_INPUT",
        "Select a reviewed composition from this scene's current visual state and canonical inputs",
      );
    compositionHashes[id] = await storyHash(asset);
  }
  productionSettings.compositionHashes = compositionHashes;
  const inputHash = await storyHash({
    scene,
    beats,
    visualSignature,
    canonicalSelections: input.canonicalSelections,
    canonicalRevisionHashes,
    historicalRevisionHashes,
    predecessor: input.predecessor ?? null,
    successorOpening: input.successorOpening ?? null,
    productionSettings,
  });
  const stateHash = await storyHash(session.state);
  if (store.revision !== captureRevision)
    throw new StoryError(
      "STORY_REVISION_CONFLICT",
      "Project inputs changed during capture; capture them again",
    );
  return {
    schemaVersion: node.content ? 2 : 1,
    graphId: graph.id,
    graphRevision: graph.revision,
    nodeId: node.id,
    sceneId: scene.id,
    edgeHistory: [...edgeHistory],
    stateHash,
    effectiveState: session.state,
    visualSignature,
    canonicalSelections: structuredClone(input.canonicalSelections),
    canonicalRevisionHashes,
    historicalRefs,
    historicalRevisionHashes,
    predecessor: input.predecessor ?? null,
    successorOpening: input.successorOpening ?? null,
    productionSettings,
    inputHash,
  };
}
export function createProductionUnit(
  store: LocalStore,
  context: ProductionContext,
) {
  const graph = store.find("story_graphs", context.graphId),
    scene = store.find("scenes", context.sceneId);
  if (!graph || graph.revision !== context.graphRevision || !scene)
    throw new StoryError(
      "STORY_REVISION_CONFLICT",
      "Captured production inputs are outdated",
    );
  const existing = store
    .rows("production_units")
    .find(
      (u) =>
        u.graph_id === context.graphId &&
        u.graph_revision === context.graphRevision &&
        u.node_id === context.nodeId &&
        u.context_hash === context.inputHash &&
        u.status !== "stale",
    );
  if (existing) return structuredClone(existing);
  return structuredClone(
    store.insert("production_units", [
      {
        graph_id: context.graphId,
        graph_revision: context.graphRevision,
        node_id: context.nodeId,
        scene_id: scene.id,
        storyboard_id: scene.storyboard_id,
        context_hash: context.inputHash,
        context,
        predecessor_unit_id: context.predecessor?.unitId ?? null,
      },
    ])[0],
  );
}
export function approveProductionUnit(
  store: LocalStore,
  unitId: string,
  assetId: string,
  note: string,
  proof: {
    sha256: string;
    durationMs: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
  },
) {
  const unit = store.find("production_units", unitId),
    asset = store.find("assets", assetId);
  if (
    !proof ||
    !/^[0-9a-f]{64}$/.test(proof.sha256) ||
    ![proof.durationMs, proof.width, proof.height, proof.fps].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !unit ||
    unit.status === "stale" ||
    !asset ||
    asset.kind !== "video" ||
    !note.trim() ||
    asset.project_id !== store.projectId ||
    asset.meta?.production_unit_id !== unit.id ||
    asset.meta?.input_hash !== unit.context_hash ||
    store.find("story_graphs", unit.graph_id)?.revision !== unit.graph_revision
  )
    throw new StoryError(
      "STORY_APPROVAL_INPUT",
      "Review the current unit output before approval",
    );
  store.mediaReview(() => {
    store.update("assets", [asset], {
      meta: {
        ...asset.meta,
        review: {
          mediaHash: proof.sha256,
          probe: proof,
          status: "approved",
          note,
          reviewedAt: new Date().toISOString(),
        },
      },
    });
    store.update("assets", [asset], {
      duration_ms: proof.durationMs,
      width: proof.width,
      height: proof.height,
      fps: proof.fps,
    });
    store.update("production_units", [unit], {
      status: "approved",
      approved_asset_id: asset.id,
    });
  });
}
