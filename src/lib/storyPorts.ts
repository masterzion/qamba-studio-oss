import type { StoryNode } from "./storyTypes.ts";
export function storyPorts(node: StoryNode) {
  if (node.type === "ending") return [];
  if (node.type === "decision" || node.content?.transitionMode === "choice")
    return node.choices ?? [];
  if (node.type === "conditional")
    return [...(node.cases ?? []), { id: "fallback", label: "Otherwise" }];
  return [{ id: "next", label: "Next" }];
}
