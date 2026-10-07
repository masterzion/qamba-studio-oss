import React, { useState } from "react";
import { Video } from "lucide-react";
import { useLiveQuery } from "../../hooks/useLiveQuery";
import { storyStore } from "../../lib/db/storyGraphs";
import { availableStorySceneTimelines, openStorySceneEditor } from "../../lib/storyEditorBridge";

export default function StoryTimelinePicker({ projectId, graphId, nodeId, language, onOpen }: {
  projectId: string; graphId: string; nodeId: string; language: string; onOpen: () => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { data, reload } = useLiveQuery(async () => {
    const store = storyStore(projectId);
    const timelines = availableStorySceneTimelines(store, graphId, nodeId, language);
    return { timelines, current: timelines.find((t) => t.story_graph_id === graphId && t.story_node_id === nodeId && t.story_language === language) };
  }, ["timelines", "story_graphs"], [projectId, graphId, nodeId, language]);
  const select = async (timelineId?: string) => {
    setBusy(true); setError("");
    try {
      const graph = storyStore(projectId).find("story_graphs", graphId);
      if (!graph) throw new Error("Story is missing. Reload the project.");
      await openStorySceneEditor({ projectId, graphId, expectedGraphRevision: graph.revision, nodeId, language, timelineId });
      reload();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="story-timeline-picker" aria-label="Scene timeline">
    <label>Timeline · {language}
      <select aria-label="Scene timeline" disabled={busy} value={data?.current?.id ?? ""}
        onChange={(e) => { if (e.target.value) void select(e.target.value); }}>
        <option value="" disabled>Select a previously edited timeline…</option>
        {data?.timelines.map((t) => <option key={t.id} value={t.id}>{t.name || "Untitled timeline"}{t.meta?.archived_story ? " · previous scene cut" : ""}</option>)}
      </select>
    </label>
    {!data?.current && <button disabled={busy} onClick={() => { void select(); }}>Create scene timeline</button>}
    <button disabled={busy} onClick={onOpen}><Video size={15} aria-hidden="true" />Open timeline editor</button>
    <small>Double-click the scene to edit its timeline. Choices below define its branches.</small>
    {error && <p role="alert">{error}</p>}
  </section>;
}
