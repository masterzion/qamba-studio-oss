import React from "react";
import { Play, Clapperboard, GitBranch, Split, History, Flag, Video, TriangleAlert } from "lucide-react";
import {
  resolveText,
  resolveLocalizedText,
} from "../../../director/story_runtime.js";
import { storyPorts } from "../../lib/storyPorts";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
const icons = {
  start: Play,
  scene: Clapperboard,
  decision: GitBranch,
  conditional: Split,
  historical_event: History,
  ending: Flag,
};
export default function StoryNodeCard({ id, data, selected }: NodeProps) {
  const n = data.storyNode as any,
    issues = data.issues as any[];
  const Icon = icons[n.type as keyof typeof icons] ?? Clapperboard;
  const ports = storyPorts(n),
    updateInternals = useUpdateNodeInternals();
  const title = resolveLocalizedText(
    n.title,
    data.language as string,
    data.defaultLanguage as string,
  );
  React.useEffect(() => {
    updateInternals(id);
  }, [id, updateInternals, JSON.stringify(ports), data.language]);
  return (
    <div className={`story-node story-node-${n.type} ${selected ? "selected" : ""}`}>
      {n.type !== "start" && <Handle type="target" position={Position.Left} />}
      <div className="story-node-heading" title={n.type === "scene" ? "Double-click to open this scene's saved video timeline" : undefined}>
        <span className="story-node-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span>
        <div>
        <strong>
          {resolveText(
            n.title,
            data.language as string,
            data.defaultLanguage as string,
          ) || "Untitled"}
        </strong>
        <small>
          {n.type === "ending"
            ? "END"
            : n.type === "start"
              ? "START"
              : n.type === "scene"
                ? "SCENE"
                : n.type.replace("_", " ")}
        </small>
        </div>
      </div>
      {title.fallback && <small>Using {title.locale} title</small>}
      {issues?.length > 0 && (
        <span role="status">
          <TriangleAlert size={14} aria-hidden="true" /> {issues.length} issue{issues.length !== 1 ? "s" : ""}
        </span>
      )}
      {n.type === "scene" && <small>{data.mediaStatus as string}</small>}
      {ports.map((p: any, i: number) => (
        <div className="story-port" key={p.id}>
          {resolveText(
            p.label,
            data.language as string,
            data.defaultLanguage as string,
          ) || "Choice"}
          <Handle
            type="source"
            position={Position.Right}
            id={p.id}
            style={{ top: "50%", right: -14 }}
          />
        </div>
      ))}
      {n.type === "scene" && (
        <button
          className="nodrag nopan"
          aria-label={`Open video editor for ${resolveText(n.title, data.language as string, data.defaultLanguage as string) || "Untitled"}`}
          title="Edit this scene's blueprint, shots and video takes. Use a captured production unit to review a specific branch variant."
          onClick={(e) => {
            e.stopPropagation();
            (data.onOpenVideoEditor as (() => void) | undefined)?.();
          }}
        >
          <Video size={15} aria-hidden="true" /> Open video editor
        </button>
      )}
    </div>
  );
}
