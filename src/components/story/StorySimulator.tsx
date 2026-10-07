import React, { useState } from "react";
import {
  startSession,
  stepSession,
  listChoices,
  replaySession,
  resolveText,
} from "../../../director/story_runtime.js";
import { validateStory } from "../../lib/storyValidation";
import { storyStore } from "../../lib/db/storyGraphs";
import type { StoryGraph, StorySession } from "../../lib/storyTypes";
import ProductionPlanPanel from "./ProductionPlanPanel";
export default function StorySimulator({
  graph,
  onInspect,
  language = graph.document.defaultLanguage,
}: {
  graph: StoryGraph;
  onInspect?: (s: StorySession) => void;
  language?: string;
}) {
  const [session, setSession] = useState<StorySession | null>(null),
    [error, setError] = useState("");
  const execute = (fn: () => any) => {
    try {
      setError("");
      let s = fn();
      let auto = 0;
      while (
        ["start", "conditional", "historical_event"].includes(
          graph.document.nodes.find((n) => n.id === s.currentNodeId)!.type,
        )
      ) {
        if (++auto > 1000)
          throw new Error("Automatic transition limit reached");
        const c = listChoices(graph, s);
        if (c.available.length !== 1)
          throw new Error(
            c.blocked[0]?.reasons[0]?.message ??
              "No unique automatic transition",
          );
        s = stepSession(graph, s, c.available[0].edgeId);
      }
      setSession(s);
      onInspect?.(s);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const choices =
    session && !session.ended && session.graphRevision === graph.revision
      ? listChoices(graph, session)
      : { available: [], blocked: [] };
  const paths = storyStore(graph.project_id)
    .rows("story_simulations")
    .filter((p) => p.graph_id === graph.id);
  return (
    <section className="story-panel">
      <h2>Story simulation</h2>
      <button
        onClick={() =>
          execute(() => {
            const diagnostics = validateStory(graph.document);
            if (diagnostics.length) throw new Error(diagnostics[0].message);
            return startSession(graph);
          })
        }
      >
        Start / restart
      </button>
      {error && <p role="alert">{error}</p>}
      {session && (
        <>
          <ProductionPlanPanel
            key={`${session.currentNodeId}:${session.graphRevision}:${language}`}
            graph={graph}
            session={session}
            initialLanguage={language}
          />
          <h3>
            {resolveText(
              graph.document.nodes.find((n) => n.id === session.currentNodeId)
                ?.title,
              language,
              graph.document.defaultLanguage,
            )}
          </h3>
          {session.graphRevision !== graph.revision && (
            <p role="alert">Story changed. Restart or replay this path.</p>
          )}
          {choices.available.map((c: any) => (
            <button
              key={c.id}
              onClick={() =>
                execute(() => stepSession(graph, session, c.edgeId))
              }
            >
              {resolveText(c.label, language, graph.document.defaultLanguage) ||
                "Continue"}
            </button>
          ))}
          {choices.blocked.map((c: any) => (
            <p key={c.id}>
              Blocked:{" "}
              {resolveText(c.label, language, graph.document.defaultLanguage)} —{" "}
              {c.reasons.map((r: any) => r.message).join("; ")}
            </p>
          ))}
          {session.ended && (
            <p>Ending reached: {JSON.stringify(session.outcome)}</p>
          )}
          <h3>Effective GameState</h3>
          <pre>{JSON.stringify(session.state, null, 2)}</pre>
          <h3>Path history</h3>
          <ol>
            {session.visitedNodes.map((id, i) => (
              <li key={i}>
                <button
                  onClick={() =>
                    execute(() =>
                      replaySession(
                        graph,
                        undefined,
                        undefined,
                        session.edgeHistory.slice(0, i),
                      ),
                    )
                  }
                >
                  {resolveText(
                    graph.document.nodes.find((n) => n.id === id)?.title,
                    language,
                    graph.document.defaultLanguage,
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button
            onClick={() => {
              storyStore(graph.project_id).insert("story_simulations", [
                {
                  graph_id: graph.id,
                  graph_revision: graph.revision,
                  label: `Path ${paths.length + 1}`,
                  edge_history: session.edgeHistory,
                },
              ]);
              setError("Path saved");
            }}
          >
            Save path
          </button>
        </>
      )}
      {paths.map((p) => (
        <button
          key={p.id}
          onClick={() =>
            execute(() =>
              replaySession(graph, undefined, undefined, p.edge_history),
            )
          }
        >
          {p.label}
          {p.graph_revision !== graph.revision ? " (previous revision)" : ""}
        </button>
      ))}
    </section>
  );
}
