import React, { useEffect, useState } from "react";
import type { StoryGraph } from "../../lib/storyTypes";
import { storyStore } from "../../lib/db/storyGraphs";
import { estimateStoryCost } from "../../lib/storyCost";
export default function StoryAnalysisPanel({ graph }: { graph: StoryGraph }) {
  const [result, setResult] = useState<any>(null);
  useEffect(() => {
    setResult(null);
    const worker = new Worker(
      new URL("../../lib/storyAnalysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e) => setResult(e.data);
    worker.onerror = (e) => setResult({ error: e.message, proof: "unknown" });
    worker.postMessage({ id: graph.revision, document: graph.document });
    return () => worker.terminate();
  }, [graph.id, graph.revision]);
  const store = storyStore(graph.project_id),
    cost = estimateStoryCost(
      graph.document,
      store.rows("scenes"),
      store.rows("beats"),
      store.rows("production_units").filter((u) => u.graph_id === graph.id),
    );
  return (
    <section className="story-panel">
      <h2>Validation and path analysis</h2>
      {result ? (
        <pre>{JSON.stringify(result.result ?? result, null, 2)}</pre>
      ) : (
        <p>Analyzing in a background worker…</p>
      )}
      <h3>Production workload</h3>
      <pre>{JSON.stringify(cost, null, 2)}</pre>
    </section>
  );
}
