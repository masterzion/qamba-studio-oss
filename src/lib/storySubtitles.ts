import type { LocalStore } from "./localStore.ts";
import { storyHash } from "./storyHash.ts";
export interface SubtitleCue {
  id: string;
  lineId: string;
  startMs: number;
  endMs: number;
}
export function validateSubtitleCues(
  cues: SubtitleCue[],
  durationMs: number,
  lineIds: Set<string>,
) {
  if (!Array.isArray(cues) || !Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error("Subtitles require a measured video duration");
  let previousEnd = 0;
  const ids = new Set();
  for (const cue of cues) {
    if (
      !cue ||
      typeof cue.id !== "string" ||
      !cue.id.trim() ||
      /[\r\n\u0000]|-->/.test(cue.id) ||
      ids.has(cue.id) ||
      !lineIds.has(cue.lineId) ||
      !Number.isInteger(cue.startMs) ||
      !Number.isInteger(cue.endMs) ||
      cue.startMs < previousEnd ||
      cue.endMs <= cue.startMs ||
      cue.endMs > durationMs
    )
      throw new Error(
        "Subtitle cues must identify authored lines and have ordered, non-overlapping timings inside the measured video",
      );
    previousEnd = cue.endMs;
    ids.add(cue.id);
  }
}
function timestamp(ms: number, separator: string) {
  const h = Math.floor(ms / 3600000),
    m = Math.floor(ms / 60000) % 60,
    s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
}
export function serializeSubtitles(
  cues: SubtitleCue[],
  lines: any[],
  language: string,
  format: "vtt" | "srt",
) {
  const texts = new Map(lines.map((l) => [l.id, l.text?.[language]]));
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    cues
      .map((c, i) => {
        const text = texts.get(c.lineId);
        if (typeof text !== "string" || !text.trim())
          throw new Error(
            `Translate subtitle line ${c.lineId} into ${language}`,
          );
        if (/-->|\r|\u0000|\n\s*\n/.test(text))
          throw new Error(
            "Subtitle text contains an invalid cue delimiter or character",
          );
        return `${format === "srt" ? i + 1 : c.id}\n${timestamp(c.startMs, format === "srt" ? "," : ".")} --> ${timestamp(c.endMs, format === "srt" ? "," : ".")}\n${text}\n`;
      })
      .join("\n")
  );
}
export function cuesFromMeasuredCut(
  store: LocalStore,
  unitId: string,
): SubtitleCue[] {
  const timeline = store
    .rows("timelines")
    .find((t) => t.production_unit_id === unitId);
  const tracks = new Set(
    store
      .rows("tracks")
      .filter((t) => t.timeline_id === timeline?.id && t.name === "Dialogue")
      .map((t) => t.id),
  );
  return store
    .rows("clips")
    .filter((c) => tracks.has(c.track_id))
    .sort((a, b) => a.t_start_ms - b.t_start_ms)
    .map((c) => {
      const asset = store.find("assets", c.asset_id),
        lineId = asset?.meta?.dialogue?.id;
      if (!lineId || !asset?.duration_ms)
        throw new Error(
          "Use measured dialogue assets with their authored line IDs",
        );
      return {
        id: crypto.randomUUID(),
        lineId,
        startMs: c.t_start_ms,
        endMs: c.t_start_ms + c.duration_ms,
      };
    });
}
export async function reviewSubtitles(
  store: LocalStore,
  unitId: string,
  cues: SubtitleCue[],
  note: string,
) {
  const unit = store.find("production_units", unitId),
    asset = unit && store.find("assets", unit.approved_asset_id),
    graph = unit && store.find("story_graphs", unit.graph_id),
    node = graph?.document.nodes.find((n: any) => n.id === unit?.node_id);
  if (
    !unit ||
    !asset ||
    !graph ||
    unit.status !== "approved" ||
    graph.revision !== unit.graph_revision ||
    !node?.content ||
    !note.trim()
  )
    throw new Error(
      "Approve the current video and review subtitle timings first",
    );
  validateSubtitleCues(
    cues,
    asset.duration_ms,
    new Set(node.content.dialogue.map((l: any) => l.id)),
  );
  if (new Set(cues.map((c) => c.lineId)).size !== node.content.dialogue.length)
    throw new Error(
      "Provide measured timings for every authored dialogue line",
    );
  const hash = await storyHash({
    cues,
    content: node.content,
    mediaHash: asset.meta.review.mediaHash,
  });
  if (
    store.find("production_units", unitId)?.status !== "approved" ||
    store.find("story_graphs", graph.id)?.revision !== graph.revision
  )
    throw new Error("Story changed during subtitle review");
  store.mediaReview(() =>
    store.update("production_units", [unit], {
      subtitle_document: {
        cues,
        hash,
        mediaHash: asset.meta.review.mediaHash,
        contentHash: unit.context.productionSettings.storyContent.contentHash,
        note,
        reviewedAt: new Date().toISOString(),
        status: "approved",
      },
    }),
  );
}
export async function registerStorySubtitleAssets(
  store: LocalStore,
  unitId: string,
  write: (key: string, text: string, type: string) => Promise<void>,
) {
  const unit = store.find("production_units", unitId),
    graph = unit && store.find("story_graphs", unit.graph_id),
    node = graph?.document.nodes.find((n: any) => n.id === unit?.node_id),
    review = unit?.subtitle_document;
  if (
    !graph ||
    !node?.content ||
    unit?.status !== "approved" ||
    review?.status !== "approved" ||
    graph.revision !== unit.graph_revision
  )
    throw new Error("Review the current video and subtitle timings first");
  const files: {
    language: string;
    format: string;
    key: string;
    type: string;
    hash: string;
  }[] = [];
  for (const language of graph.document.languages ?? [
    graph.document.defaultLanguage,
  ])
    for (const format of ["vtt", "srt"] as const) {
      const text = serializeSubtitles(
          review.cues,
          node.content.dialogue,
          language,
          format,
        ),
        bytes = new TextEncoder().encode(text);
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const key = `subtitles/${unitId}/${hash}-${language}.${format}`,
        type = format === "vtt" ? "text/vtt" : "text/plain";
      await write(key, text, type);
      files.push({ language, format, key, type, hash });
    }
  const live = store.find("production_units", unitId);
  if (
    live?.status !== "approved" ||
    live.subtitle_document?.hash !== review.hash ||
    store.find("story_graphs", graph.id)?.revision !== unit.graph_revision
  )
    throw new Error("Story changed while saving subtitles; review them again");
  store.mediaReview(() => {
    const assetIds: Record<string, string> = {};
    for (const file of files) {
      const existing = store
        .rows("assets")
        .find((a) => a.b2_key === file.key && !a.deleted_at);
      const asset =
        existing ??
        store.insert("assets", [
          {
            project_id: store.projectId,
            kind: "file",
            b2_key: file.key,
            content_type: file.type,
            meta: {
              production_unit_id: unitId,
              subtitle: {
                language: file.language,
                format: file.format,
                timingHash: review.hash,
              },
              review: {
                status: "approved",
                mediaHash: file.hash,
                note: review.note,
                reviewedAt: review.reviewedAt,
              },
            },
          },
        ])[0];
      assetIds[`${file.language}.${file.format}`] = asset.id;
    }
    store.update("production_units", [live], {
      subtitle_document: { ...review, assetIds },
    });
  });
}
