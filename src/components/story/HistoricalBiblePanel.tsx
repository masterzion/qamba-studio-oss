import React, { useState } from "react";
import { storyStore } from "../../lib/db/storyGraphs";
import {
  SOURCE_KINDS,
  correctHistoricalRecord,
  searchHistoricalSources,
  type HistoricalRecord,
} from "../../lib/historicalBible";
import { uploadMedia } from "../../lib/upload";
import { registerAsset } from "../../lib/db/assets";
import { importLoreDoc } from "../../lib/db/lore";
import { useLiveQuery } from "../../hooks/useLiveQuery";
export default function HistoricalBiblePanel({
  projectId,
}: {
  projectId: string;
}) {
  const store = storyStore(projectId);
  const { data } = useLiveQuery(
    async () => ({
      sources: structuredClone(store.rows("historical_sources")),
      entries: structuredClone(store.rows("bible_entries")),
    }),
    ["historical_sources", "bible_entries"],
    [projectId],
  );
  const [title, setTitle] = useState(""),
    [kind, setKind] = useState<string>("citation"),
    [citation, setCitation] = useState(""),
    [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState(""),
    [classification, setClassification] =
      useState<HistoricalRecord["classification"]>("PLAUSIBLE"),
    [sourceId, setSourceId] = useState(""),
    [locator, setLocator] = useState(""),
    [date, setDate] = useState(""),
    [query, setQuery] = useState("");
  const act = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addSource = async () => {
    if (
      !title.trim() ||
      (!citation.trim() && !url.trim() && !file && !text.trim())
    )
      throw new Error(
        "Enter a source title and citation, URL, text or original file",
      );
    let asset_id = null,
      sha256 = null,
      rag_document_id = null;
    if (file) {
      const bytes = await file.arrayBuffer(),
        digest = await crypto.subtle.digest("SHA-256", bytes);
      sha256 = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const key = `sources/${crypto.randomUUID()}/${file.name.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
      await uploadMedia(file, key);
      asset_id = (
        await registerAsset({
          project_id: projectId,
          b2_key: key,
          kind: "file",
          content_type: file.type || "application/octet-stream",
          bytes: file.size,
          meta: { sourceOriginal: true, sha256 },
        })
      ).id;
    }
    if (text.trim())
      rag_document_id = (
        await importLoreDoc({
          projectId,
          title,
          text,
          source: "historical-source",
        })
      ).doc.id;
    store.insert("historical_sources", [
      {
        project_id: projectId,
        kind,
        title,
        citation,
        url: url || null,
        asset_id,
        sha256,
        rag_document_id,
        accessed_at: new Date().toISOString(),
      },
    ]);
    setTitle("");
    setText("");
    setFile(null);
  };
  const addFact = () => {
    if (!statement.trim()) throw new Error("Enter a historical statement");
    const h: HistoricalRecord = {
      classification,
      statement,
      date: { label: date, earliest: null, latest: null, precision: "label" },
      locationEntryId: null,
      sourceRefs: sourceId
        ? [{ sourceId, locator, excerpt: null, note: "" }]
        : [],
      confidence: "medium",
      mutable: classification !== "DOCUMENTED",
      review: { status: "draft", reviewedAt: null, note: "" },
    };
    store.insert("bible_entries", [
      {
        project_id: projectId,
        kind: "lore",
        name: statement.slice(0, 90),
        summary: statement,
        doc: { historical: h },
      },
    ]);
    setStatement("");
  };
  return (
    <section className="story-panel">
      <h2>Historical Bible and original sources</h2>
      {error && <p role="alert">{error}</p>}
      <fieldset>
        <legend>Register evidence</legend>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Source kind
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {SOURCE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Bibliographic citation
          <textarea
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
          />
        </label>
        <label>
          URL (stored without fetching)
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Original file
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Manual source text
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button disabled={busy} onClick={() => act(addSource)}>
          Register source
        </button>
      </fieldset>
      <fieldset>
        <legend>Add historical statement</legend>
        <textarea
          aria-label="Historical statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value as any)}
        >
          {["DOCUMENTED", "PLAUSIBLE", "FICTIONAL"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          placeholder="Historical date or range"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          aria-label="Evidence source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">Choose source…</option>
          {data?.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <input
          placeholder="Page, archive identifier, map coordinates"
          value={locator}
          onChange={(e) => setLocator(e.target.value)}
        />
        <button disabled={busy} onClick={() => act(addFact)}>
          Add draft fact
        </button>
      </fieldset>
      <h3>Historical review</h3>
      {data?.entries
        .filter((e) => e.doc?.historical)
        .map((e) => (
          <article key={e.id}>
            <strong>{e.name}</strong>
            <p>{e.doc.historical.statement}</p>
            <p>
              {e.doc.historical.classification} ·{" "}
              {e.doc.historical.review.status}
            </p>
            <button
              onClick={() => {
                const note = window.prompt(
                  "Record your human historical review and correction reason",
                );
                if (note)
                  act(() =>
                    correctHistoricalRecord(
                      store,
                      e.id,
                      {
                        ...e.doc.historical,
                        review: {
                          status: "approved",
                          reviewedAt: new Date().toISOString(),
                          note,
                        },
                      },
                      note,
                    ),
                  );
              }}
            >
              Approve cited fact
            </button>
            <button
              onClick={() => {
                const statement = window.prompt(
                  "Correct this factual statement using its cited evidence",
                  e.doc.historical.statement,
                );
                if (statement === null) return;
                const reason = window.prompt(
                  "Explain the correction and cite the relevant source locator",
                );
                if (reason)
                  act(() =>
                    correctHistoricalRecord(
                      store,
                      e.id,
                      {
                        ...e.doc.historical,
                        statement,
                        review: {
                          status: "needs_review",
                          reviewedAt: null,
                          note: reason,
                        },
                      },
                      reason,
                    ),
                  );
              }}
            >
              Correct statement with audit
            </button>
          </article>
        ))}
      <h3>Offline retrieval</h3>
      <input
        aria-label="Search historical sources"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searchHistoricalSources(store, query).map((r) => (
        <article key={`${r.method}-${r.id}`}>
          <strong>{r.title}</strong>
          <small> · {r.locator} · lexical search</small>
          <p>{r.content}</p>
        </article>
      ))}
      <h3>Source registry</h3>
      {data?.sources.map((s) => (
        <p key={s.id}>
          {s.title} · {s.kind} ·{" "}
          {s.asset_id || s.rag_document_id
            ? "available locally"
            : "citation or URL only"}
        </p>
      ))}
    </section>
  );
}
