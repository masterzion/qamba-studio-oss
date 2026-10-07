import { StoryError, canonicalJSON } from "../../director/story_runtime.js";
import type { LocalStore, Row } from "./localStore.ts";
import type { CitationRef } from "./storyTypes.ts";
export const SOURCE_KINDS = [
  "photograph",
  "map",
  "archival_document",
  "newspaper",
  "dataset",
  "book",
  "museum_reference",
  "url",
  "citation",
] as const;
export interface HistoricalRecord {
  classification: "DOCUMENTED" | "PLAUSIBLE" | "FICTIONAL";
  statement: string;
  date: {
    label: string;
    earliest: string | null;
    latest: string | null;
    precision: string;
  };
  locationEntryId: string | null;
  sourceRefs: CitationRef[];
  confidence: "high" | "medium" | "low";
  mutable: boolean;
  review: {
    status: "draft" | "approved" | "needs_review";
    reviewedAt: string | null;
    note: string;
  };
}
export function assertHistoricalRecord(store: LocalStore, row: Row): void {
  const h = row.doc?.historical as HistoricalRecord | undefined;
  if (!h) return;
  if (
    !["DOCUMENTED", "PLAUSIBLE", "FICTIONAL"].includes(h.classification) ||
    !h.statement?.trim() ||
    !h.date ||
    !Array.isArray(h.sourceRefs) ||
    !["high", "medium", "low"].includes(h.confidence) ||
    !["draft", "approved", "needs_review"].includes(h.review?.status)
  )
    throw new StoryError(
      "STORY_INVALID_HISTORY",
      "Historical records require classification, statement, date, confidence and review",
    );
  if (
    h.classification === "DOCUMENTED" &&
    (h.mutable !== false || !h.sourceRefs.length)
  )
    throw new StoryError(
      "STORY_DOCUMENTED_EVIDENCE",
      "Documented facts must be immutable and cite evidence",
    );
  for (const ref of h.sourceRefs)
    if (
      store.find("historical_sources", ref.sourceId)?.project_id !==
        store.projectId ||
      typeof ref.locator !== "string"
    )
      throw new StoryError(
        "STORY_INVALID_SOURCE",
        "Historical citations must resolve within this project",
      );
  if (
    h.locationEntryId &&
    store.find("bible_entries", h.locationEntryId)?.kind !== "location"
  )
    throw new StoryError(
      "STORY_INVALID_HISTORY",
      "Choose a canonical location for this fact",
    );
  if (h.date.earliest && h.date.latest && h.date.latest < h.date.earliest)
    throw new StoryError(
      "STORY_INVALID_HISTORY",
      "The latest date precedes the earliest date",
    );
}
export function assertCanonicalRecord(store: LocalStore, row: Row): void {
  const c = row.doc?.canonical;
  if (!c) return;
  if (
    !Number.isInteger(c.revision) ||
    c.revision < 1 ||
    !["draft", "approved", "needs_review"].includes(c.approval) ||
    !["character", "location", "prop", "costume"].includes(c.entityKind)
  )
    throw new StoryError(
      "STORY_CANONICAL_INPUT",
      "Canonical records require kind, revision and approval",
    );
  const seen = new Set([row.id]);
  let parentId = row.doc.variant_of;
  let root = row;
  while (parentId) {
    if (seen.has(parentId))
      throw new StoryError(
        "STORY_CANONICAL_CYCLE",
        "Variant ancestry contains a cycle",
      );
    seen.add(parentId);
    root = store.find("bible_entries", parentId)!;
    if (!root || root.project_id !== store.projectId)
      throw new StoryError(
        "STORY_CANONICAL_INPUT",
        "Variant parents must belong to this project",
      );
    parentId = root.doc?.variant_of;
  }
  if (c.rootEntryId !== root.id)
    throw new StoryError(
      "STORY_CANONICAL_INPUT",
      "Canonical root identity does not match variant ancestry",
    );
}
export function guardSourceDeletion(store: LocalStore, rows: Row[]): void {
  const ids = new Set(rows.map((r) => r.id)),
    has = (refs: any[]) => refs?.some((r) => ids.has(r.sourceId));
  if (
    store
      .rows("bible_entries")
      .some(
        (e) =>
          has(e.doc?.historical?.sourceRefs) ||
          has(e.doc?.canonical?.sourceRefs),
      ) ||
    store
      .rows("story_graphs")
      .some((g) =>
        g.document.nodes.some(
          (n: any) =>
            has(n.sourceRefs) || n.choices?.some((c: any) => has(c.sourceRefs)),
        ),
      ) ||
    store.rows("production_units").some((u) => has(u.context?.historicalRefs))
  )
    throw new StoryError(
      "STORY_SOURCE_IN_USE",
      "Retain cited sources while historical records, stories or production units use them",
    );
}
/** Called by the store, including PostgREST/director/Python writes. */
export function guardHistoricalWrite(
  store: LocalStore,
  previous: Row | undefined,
  next: Row | undefined,
  humanCorrection = false,
) {
  if (
    next?.doc?.historical?.review?.status === "approved" &&
    canonicalJSON(previous?.doc?.historical ?? null) !==
      canonicalJSON(next.doc.historical) &&
    !humanCorrection
  )
    throw new StoryError(
      "STORY_HUMAN_APPROVAL",
      "Historical approval requires a human evidence review",
    );
  if (
    previous?.doc?.historical?.classification === "DOCUMENTED" &&
    canonicalJSON(previous.doc.historical) !==
      canonicalJSON(next?.doc?.historical ?? null) &&
    !humanCorrection
  )
    throw new StoryError(
      "STORY_DOCUMENTED_LOCK",
      "Documented facts require a human correction with cited evidence",
    );
  if (next) {
    assertHistoricalRecord(store, next);
    assertCanonicalRecord(store, next);
  }
}
export function correctHistoricalRecord(
  store: LocalStore,
  entryId: string,
  historical: HistoricalRecord,
  reason: string,
): void {
  const entry = store.find("bible_entries", entryId);
  if (!entry || !reason.trim() || !historical.sourceRefs.length)
    throw new StoryError(
      "STORY_CORRECTION_EVIDENCE",
      "A human correction requires a reason and cited evidence",
    );
  const next = {
    ...entry,
    doc: {
      ...entry.doc,
      historical,
      historicalRevisions: [
        ...(entry.doc?.historicalRevisions ?? []),
        {
          version: entry.version,
          historical: entry.doc?.historical ?? null,
          reason,
          correctedAt: new Date().toISOString(),
        },
      ],
    },
    version: (entry.version ?? 1) + 1,
  };
  assertHistoricalRecord(store, next);
  store.historicalCorrection(() =>
    store.update("bible_entries", [entry], next),
  );
}
export function searchHistoricalSources(
  store: LocalStore,
  query: string,
  limit = 6,
) {
  const terms = [
    ...new Set(
      query
        .toLocaleLowerCase("lv")
        .normalize("NFC")
        .match(/[\p{L}\p{N}]+/gu) ?? [],
    ),
  ].slice(0, 64);
  if (!terms.length) return [];
  const chunks = store.rows("rag_chunks").map((c) => {
    const document = store.find("rag_documents", c.document_id);
    const source = store
      .rows("historical_sources")
      .find((s) => s.rag_document_id === document?.id);
    const text = `${document?.title ?? ""} ${c.content ?? ""}`
      .toLocaleLowerCase("lv")
      .normalize("NFC");
    const score =
      terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) / terms.length;
    return {
      id: c.id,
      document_id: c.document_id,
      source_id: source?.id ?? null,
      title: document?.title ?? "",
      content: c.content,
      locator: c.meta?.locator ?? `chunk ${c.idx ?? c.chunk_index ?? 0}`,
      similarity: score,
      method: "lexical",
    };
  });
  const sources = store.rows("historical_sources").map((s) => {
    const content = `${s.title} ${s.citation} ${s.creator} ${s.date_label}`;
    const text = content.toLocaleLowerCase("lv");
    return {
      id: s.id,
      source_id: s.id,
      document_id: null,
      title: s.title,
      content,
      locator: "bibliographic record",
      similarity:
        terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) /
        terms.length,
      method: "lexical",
    };
  });
  return [...chunks, ...sources]
    .filter((c) => c.similarity > 0)
    .sort(
      (a, b) =>
        b.similarity - a.similarity || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, Math.max(1, Math.min(50, limit)));
}
