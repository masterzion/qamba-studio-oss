import {
  canonicalJSON,
  startSession,
  listChoices,
  stepSession,
  evaluateCondition,
} from "../../director/story_runtime.js";
import { validateStory } from "./storyValidation.ts";
import type { LocalStore } from "./localStore.ts";
import type { StoryGraph, Condition } from "./storyTypes.ts";
import { storyHash } from "./storyHash.ts";
import { serializeSubtitles, validateSubtitleCues } from "./storySubtitles.ts";
import { validateGraph } from "../../director/story_runtime.js";
export interface PackageFile {
  path: string;
  text: string;
  contentType: string;
}
export interface PackageMedia {
  key: string;
  contentType: string;
  expectedSha256: string;
}
export interface ExportSpec {
  playable?: boolean;
  languages?: string[];
  projectId: string;
  storyId: string;
  graphRevision: number;
  title: string;
  language: string;
  entryNodeId: string;
  engineVersion: string;
  files: PackageFile[];
  media: PackageMedia[];
}
export async function prepareStoryExport(
  store: LocalStore,
  graph: StoryGraph,
  mode: "playable" | "authoring" = "playable",
): Promise<ExportSpec> {
  const frozen = store.snapshot(),
    snapshot = (await import("./localStore.ts")).LocalStore.fromSnapshot(
      frozen,
      store.ownerId,
    );
  const units = snapshot
    .rows("production_units")
    .filter(
      (u) => u.graph_id === graph.id && u.graph_revision === graph.revision,
    );
  if (snapshot.find("story_graphs", graph.id)?.revision !== graph.revision)
    throw new Error("Story changed; reload before export");
  if (mode === "authoring") {
    if (graph.document.schemaVersion !== 2)
      throw new Error(
        "Upgrade this story to START / SCENE / END before exporting authoring data",
      );
    const check = validateGraph(graph);
    if (!check.ok) throw new Error(check.errors[0].message);
    return {
      projectId: store.projectId,
      storyId: graph.id,
      graphRevision: graph.revision,
      title: graph.title,
      language: graph.document.defaultLanguage,
      languages: graph.document.languages,
      entryNodeId: graph.document.entryNodeId,
      engineVersion: graph.document.engineVersion,
      playable: false,
      media: [],
      files: [
        {
          path: "graph.json",
          text: canonicalJSON(graph.document),
          contentType: "application/json",
        },
        ...["scenes.json", "historical.json", "runtime/conformance.json"].map(
          (path) => ({ path, text: "[]", contentType: "application/json" }),
        ),
        {
          path: "dialogue.json",
          text: canonicalJSON(
            graph.document.nodes
              .filter((n) => n.content)
              .map((n) => ({ nodeId: n.id, dialogue: n.content!.dialogue })),
          ),
          contentType: "application/json",
        },
        {
          path: "localization.json",
          text: canonicalJSON({
            languages: graph.document.languages,
            defaultLanguage: graph.document.defaultLanguage,
          }),
          contentType: "application/json",
        },
        {
          path: "reports/validation.json",
          text: canonicalJSON({
            playable: false,
            diagnostics: validateStory(graph.document),
            graphHash: await storyHash(graph.document),
          }),
          contentType: "application/json",
        },
      ],
    };
  }
  const diagnostics = validateStory(
    graph.document,
    {
      sceneIds: new Set(snapshot.rows("scenes").map((s) => s.id)),
      historicalEntries: new Map(
        snapshot.rows("bible_entries").map((e) => [e.id, e]),
      ),
      sources: new Map(
        snapshot.rows("historical_sources").map((s) => [s.id, s]),
      ),
      productionUnits: units,
    },
    true,
  );
  if (diagnostics.length) throw new Error(diagnostics[0].message);
  const subtitleFiles: PackageFile[] = [];
  const languages = graph.document.languages ?? [
    graph.document.defaultLanguage,
  ];
  const scenes: any[] = [],
    media: PackageMedia[] = [],
    seen = new Set<string>(),
    queue = [startSession(graph)],
    states = new Map<string, any[]>(),
    cases: any[] = [];
  let head = 0;
  while (head < queue.length) {
    if (seen.size >= 50000)
      throw new Error(
        "Export state coverage is incomplete; reduce the supported state domain",
      );
    const s = queue[head++],
      key = `${s.currentNodeId}:${canonicalJSON(s.state)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = graph.document.nodes.find((n) => n.id === s.currentNodeId)!;
    if (s.ended)
      cases.push({
        edgeHistory: s.edgeHistory,
        currentNodeId: s.currentNodeId,
        state: s.state,
        outcome: s.outcome,
      });
    if (n.type === "scene") {
      const list = states.get(n.id) ?? [];
      list.push(s.state);
      states.set(n.id, list);
    }
    const choices = s.ended
      ? { available: [], blocked: [] }
      : listChoices(graph, s);
    if (!s.ended && !choices.available.length)
      throw new Error(`Reachable state is stranded at ${n.title}`);
    for (const c of choices.available)
      queue.push(stepSession(graph, s, c.edgeId));
  }
  for (const node of graph.document.nodes.filter((n) => n.type === "scene")) {
    const variants = units
      .filter((u) => u.node_id === node.id && u.status === "approved")
      .map((u) => {
        const asset = snapshot.find("assets", u.approved_asset_id);
        if (
          !asset ||
          asset.deleted_at ||
          asset.meta?.review?.status !== "approved" ||
          asset.meta?.input_hash !== u.context_hash ||
          !/^[0-9a-f]{64}$/.test(asset.meta?.review?.mediaHash ?? "") ||
          !asset.duration_ms ||
          !asset.fps ||
          !asset.width ||
          !asset.height
        )
          throw new Error(
            `Approved output is missing or unverified for ${node.title}`,
          );
        const when: Condition = u.context.productionSettings?.presentationWhen;
        if (!when)
          throw new Error(
            `Set a declarative presentation condition for ${node.title}'s approved unit`,
          );
        media.push({
          key: asset.b2_key,
          contentType: asset.content_type ?? "video/mp4",
          expectedSha256: asset.meta.review.mediaHash,
        });
        return {
          presentationId: u.id,
          speechLanguage:
            u.context.productionSettings.language ??
            graph.document.defaultLanguage,
          unitId: u.id,
          when,
          mediaKey: asset.b2_key,
          durationMs: asset.duration_ms,
          fps: asset.fps,
          width: asset.width,
          height: asset.height,
          contextHash: u.context_hash,
          canonicalSelections: u.context.canonicalSelections,
          canonicalRevisionHashes: u.context.canonicalRevisionHashes,
          sourceRefs: u.context.historicalRefs,
          historicalRevisionHashes: u.context.historicalRevisionHashes,
          approval: asset.meta.review,
        };
      });
    for (const state of states.get(node.id) ?? []) {
      for (const language of languages) {
        const matches = variants.filter(
          (v) =>
            v.speechLanguage === language &&
            evaluateCondition(v.when, state, graph.document.stateDefinitions)
              .ok,
        );
        if (matches.length !== 1)
          throw new Error(
            `Scene ${node.title} has ${matches.length} matching presentations in a reachable state; exactly one is required`,
          );
      }
    }
    if (node.content)
      for (const variant of variants) {
        const unit = units.find((u) => u.id === variant.unitId)!,
          review = unit.subtitle_document;
        if (!node.content.dialogue.length) continue;
        if (
          review?.status !== "approved" ||
          review.mediaHash !== variant.approval.mediaHash ||
          review.contentHash !==
            unit.context.productionSettings.storyContent?.contentHash
        )
          throw new Error(
            "Review current measured subtitle timings for each presentation before export",
          );
        validateSubtitleCues(
          review.cues,
          variant.durationMs,
          new Set(node.content.dialogue.map((l) => l.id)),
        );
        if (
          review.hash !==
          (await storyHash({
            cues: review.cues,
            content: node.content,
            mediaHash: variant.approval.mediaHash,
          }))
        )
          throw new Error("Subtitle content changed after review");
        const subtitles: Record<string, string> = {};
        for (const language of languages) {
          const path = `subtitles/${variant.presentationId}/${language}.vtt`;
          subtitles[language] = path;
          for (const format of ["vtt", "srt"] as const) {
            const registered = snapshot.find(
              "assets",
              review.assetIds?.[`${language}.${format}`],
            );
            if (
              !registered ||
              registered.deleted_at ||
              registered.meta?.review?.status !== "approved" ||
              registered.meta?.subtitle?.timingHash !== review.hash ||
              registered.meta?.production_unit_id !== unit.id
            )
              throw new Error(
                "Save and register reviewed subtitles in every language before export",
              );
            media.push({
              key: registered.b2_key,
              contentType: registered.content_type,
              expectedSha256: registered.meta.review.mediaHash,
            });
            subtitleFiles.push({
              path: `subtitles/${variant.presentationId}/${language}.${format}`,
              text: serializeSubtitles(
                review.cues,
                node.content.dialogue,
                language,
                format,
              ),
              contentType: format === "vtt" ? "text/vtt" : "text/plain",
            });
          }
        }
        Object.assign(variant, { subtitles });
      }
    scenes.push({ nodeId: node.id, sceneId: node.sceneId, variants });
  }
  const attachments: any[] = [];
  const attach = (id: string, role: string, evidenceHash?: string) => {
    const asset = snapshot.find("assets", id),
      hash = evidenceHash ?? asset?.meta?.review?.mediaHash;
    if (
      !asset ||
      asset.deleted_at ||
      (!evidenceHash && asset.meta?.review?.status !== "approved") ||
      !/^[0-9a-f]{64}$/.test(hash ?? "")
    )
      throw new Error(`Review and hash the ${role} asset before export`);
    media.push({
      key: asset.b2_key,
      contentType: asset.content_type ?? "application/octet-stream",
      expectedSha256: hash,
    });
    attachments.push({
      assetId: id,
      role,
      mediaKey: asset.b2_key,
      contentType: asset.content_type,
    });
  };
  for (const node of graph.document.nodes) {
    for (const choice of node.choices ?? [])
      if (choice.iconAssetId) attach(choice.iconAssetId, "choice-icon");
    if (node.presentation?.posterAssetId)
      attach(node.presentation.posterAssetId, "scene-poster");
    if (node.presentation?.subtitleAssetId)
      attach(node.presentation.subtitleAssetId, "subtitles");
  }
  for (const source of snapshot.rows("historical_sources"))
    if (source.asset_id)
      attach(source.asset_id, "original-evidence", source.sha256);
  const { editor, metadata, ...document } = graph.document;
  const historical = {
    sources: snapshot.rows("historical_sources").map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      url: s.url,
      citation: s.citation,
      creator: s.creator,
      dateLabel: s.date_label,
      rightsNote: s.rights_note,
      sha256: s.sha256,
      originalAssetId: s.asset_id ?? null,
    })),
    entries: snapshot
      .rows("bible_entries")
      .filter((e) => e.doc?.historical)
      .map((e) => ({
        id: e.id,
        name: e.name,
        version: e.version,
        historical: e.doc.historical,
      })),
  };
  const files: PackageFile[] = [
    ...subtitleFiles,
    {
      path: "dialogue.json",
      text: canonicalJSON(
        graph.document.nodes
          .filter((n) => n.content)
          .map((n) => ({ nodeId: n.id, dialogue: n.content!.dialogue })),
      ),
      contentType: "application/json",
    },
    {
      path: "localization.json",
      text: canonicalJSON({
        languages,
        defaultLanguage: graph.document.defaultLanguage,
      }),
      contentType: "application/json",
    },
    {
      path: "assets.json",
      text: canonicalJSON(attachments),
      contentType: "application/json",
    },
    {
      path: "graph.json",
      text: canonicalJSON({ ...document, metadata: {} }),
      contentType: "application/json",
    },
    {
      path: "scenes.json",
      text: canonicalJSON(scenes),
      contentType: "application/json",
    },
    {
      path: "historical.json",
      text: canonicalJSON(historical),
      contentType: "application/json",
    },
    {
      path: "runtime/conformance.json",
      text: canonicalJSON({ cases }),
      contentType: "application/json",
    },
    {
      path: "reports/validation.json",
      text: canonicalJSON({
        diagnostics,
        exploredStates: seen.size,
        coverage: "proven",
        graphHash: await storyHash({ ...document, metadata: {} }),
      }),
      contentType: "application/json",
    },
  ];
  if (
    store.find("story_graphs", graph.id)?.revision !== graph.revision ||
    store.revision !== frozen.revision
  )
    throw new Error(
      "Project changed during export preparation; prepare it again",
    );
  return {
    playable: true,
    languages,
    projectId: store.projectId,
    storyId: graph.id,
    graphRevision: graph.revision,
    title: graph.title,
    language: graph.document.defaultLanguage,
    entryNodeId: graph.document.entryNodeId,
    engineVersion: graph.document.engineVersion,
    files,
    media: [...new Map(media.map((m) => [m.key, m])).values()],
  };
}
