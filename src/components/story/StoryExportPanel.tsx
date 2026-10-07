import React, { useState } from "react";
import { prepareStoryExport } from "../../lib/storyExport";
import { storyStore } from "../../lib/db/storyGraphs";
import { invokeStrict } from "../../lib/desktop";
import type { StoryGraph } from "../../lib/storyTypes";
export default function StoryExportPanel({ graph }: { graph: StoryGraph }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"playable" | "authoring">("playable");
  return (
    <section className="story-panel">
      <h2>Interactive story package</h2>
      <label>
        Export mode
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "playable" | "authoring")}
        >
          <option value="playable">
            Playable package · reviewed media required
          </option>
          <option value="authoring">
            Authoring data · draft graph and dialogue
          </option>
        </select>
      </label>
      <p>
        Export requires a complete graph, human-reviewed history and current
        approved media with exactly one presentation for every reachable state.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const spec = await prepareStoryExport(
              storyStore(graph.project_id),
              graph,
              mode,
            );
            const path = await invokeStrict<string | null>("story_export", {
              spec,
            });
            setMessage(
              path ? `Package verified and saved: ${path}` : "Export canceled",
            );
          } catch (e: any) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Validate and export package…
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
