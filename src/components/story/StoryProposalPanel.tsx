import React, { useState } from "react";
import { storyStore } from "../../lib/db/storyGraphs";
import { applyStoryProposal } from "../../lib/storyTools";
import { useLiveQuery } from "../../hooks/useLiveQuery";
export default function StoryProposalPanel({
  projectId,
  onApplied,
}: {
  projectId: string;
  onApplied: () => void;
}) {
  const store = storyStore(projectId),
    { data } = useLiveQuery(
      async () =>
        structuredClone(
          store.find("projects", projectId)?.settings?.story_proposals ?? [],
        ),
      ["projects"],
      [projectId],
    ),
    [message, setMessage] = useState("");
  return (
    <section className="story-panel">
      <h2>Director proposals</h2>
      {!data?.length && (
        <p>
          Ask the local director to read and propose changes to an interactive
          graph. Proposals stay here until you accept them.
        </p>
      )}
      {data?.map((p: any) => (
        <article key={p.id}>
          <h3>{p.summary}</h3>
          <p>
            Graph {p.graphId} · based on revision {p.baseRevision}
          </p>
          <pre>
            {JSON.stringify(
              {
                diagnostics: p.diagnostics,
                provenance: p.provenance,
                before: store.find("story_graphs", p.graphId)?.document,
                after: p.document,
              },
              null,
              2,
            )}
          </pre>
          <button
            onClick={() => {
              try {
                applyStoryProposal(store, p.id);
                setMessage("Proposal accepted");
                onApplied();
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            Accept reviewed proposal
          </button>
          <button
            onClick={() => {
              const project = store.find("projects", projectId)!;
              store.update("projects", [project], {
                settings: {
                  ...project.settings,
                  story_proposals: project.settings.story_proposals.filter(
                    (x: any) => x.id !== p.id,
                  ),
                },
              });
            }}
          >
            Reject proposal
          </button>
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
