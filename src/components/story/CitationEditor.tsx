import React from "react";
import { storyStore } from "../../lib/db/storyGraphs";
import type { CitationRef } from "../../lib/storyTypes";
export default function CitationEditor({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: CitationRef[];
  onChange: (v: CitationRef[]) => void;
}) {
  const sources = storyStore(projectId).rows("historical_sources");
  return (
    <fieldset>
      <legend>Evidence citations</legend>
      {value.map((r, i) => (
        <div key={i}>
          <select
            aria-label="Citation source"
            value={r.sourceId}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, sourceId: e.target.value } : v,
                ),
              )
            }
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <input
            aria-label="Citation locator"
            value={r.locator}
            placeholder="Page, archive ID, map coordinates"
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, locator: e.target.value } : v,
                ),
              )
            }
          />
          <textarea
            aria-label="Citation note"
            value={r.note}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, note: e.target.value } : v,
                ),
              )
            }
          />
          <button onClick={() => onChange(value.filter((_, j) => i !== j))}>
            Remove citation
          </button>
        </div>
      ))}
      <button
        disabled={!sources.length}
        onClick={() =>
          onChange([
            ...value,
            { sourceId: sources[0].id, locator: "", excerpt: null, note: "" },
          ])
        }
      >
        Add citation
      </button>
      {!sources.length && <p>Register evidence in Historical Bible first.</p>}
    </fieldset>
  );
}
