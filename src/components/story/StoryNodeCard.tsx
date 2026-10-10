import React from "react";
import VideoPreviewThumb from "../ui/VideoPreviewThumb";
import { Play, Clapperboard, GitBranch, Split, History, Flag, Video, TriangleAlert, Music } from "lucide-react";
import {
  resolveText,
  resolveLocalizedText,
} from "../../../director/story_runtime.js";
import { storyPorts } from "../../lib/storyPorts";
import type { CanvasNode } from "./StoryCanvas";
const icons = {
  start: Play,
  base_sound_track: Music,
  scene: Clapperboard,
  decision: GitBranch,
  conditional: Split,
  historical_event: History,
  ending: Flag,
};
export default function StoryNodeCard({ data, selected, onLayout }: CanvasNode & { onLayout?: (width: number, height: number, ports: { id: string; y: number }[]) => void }) {
  const element = React.useRef<HTMLDivElement>(null);
  const n = data.storyNode as any,
    issues = data.issues as any[];
  const Icon = icons[n.type as keyof typeof icons] ?? Clapperboard;
  const ports = storyPorts(n);
  const title = resolveLocalizedText(
    n.title,
    data.language as string,
    data.defaultLanguage as string,
  );
  React.useLayoutEffect(() => {
    const card = element.current;
    if (!card || !onLayout) return;
    const measure = () => onLayout(card.offsetWidth, card.offsetHeight,
      Array.from(card.querySelectorAll<HTMLElement>("[data-story-port]")).map(port => ({ id: port.dataset.storyPort!, y: port.offsetTop + port.offsetHeight / 2 + card.clientTop })));
    measure();
    const observer = new ResizeObserver(measure); observer.observe(card);
    return () => observer.disconnect();
  }, [onLayout, JSON.stringify(ports), data.language]);
  return (
    <div ref={element} onMouseDownCapture={e => { if ((e.target as Element).closest("button,input,textarea,select,.nodrag,.nopan")) e.stopPropagation(); }} onTouchStartCapture={e => { if ((e.target as Element).closest("button,input,textarea,select,.nodrag,.nopan")) e.stopPropagation(); }} className={`story-node story-node-${n.type} ${selected ? "selected" : ""}`}>
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
      {n.type === "base_sound_track" && <small>{n.soundtrackPaths?.length ?? 0} soundtrack(s) · game engine</small>}
      {issues?.length > 0 && (
        <span role="status">
          <TriangleAlert size={14} aria-hidden="true" /> {issues.length} issue{issues.length !== 1 ? "s" : ""}
        </span>
      )}
      {n.type === "scene" && <small>{data.mediaStatus as string}</small>}
      {n.type === "scene" && typeof data.renderedVideoUrl === "string" && (
        <div className="story-render-preview nodrag nopan" aria-label="Rendered scene video preview">
          <VideoPreviewThumb key={data.renderedVideoUrl as string} src={data.renderedVideoUrl as string} eager />
        </div>
      )}
      {ports.map((p: any) => (
        <div className="story-port" key={p.id} data-story-port={p.id}>
          {resolveText(
            p.label,
            data.language as string,
            data.defaultLanguage as string,
          ) || "Choice"}

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
