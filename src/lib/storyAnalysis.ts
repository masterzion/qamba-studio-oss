import {
  startSession,
  listChoices,
  stepSession,
  canonicalJSON,
} from "../../director/story_runtime.js";
import { validateStory } from "./storyValidation.ts";
import type { GraphDocument } from "./storyTypes.ts";
export function analyzeStory(
  g: GraphDocument,
  limits = { maxStates: 50000, budgetMs: 2000 },
) {
  const diagnostics = validateStory(g);
  const endings = g.nodes.filter((n) => n.type === "ending");
  const incoming = new Map(
    g.nodes.map((n) => [
      n.id,
      g.edges.filter((e) => e.targetNodeId === n.id).length,
    ]),
  );
  const convergences = g.nodes
    .filter((n) => (incoming.get(n.id) ?? 0) > 1)
    .map((n) => n.id);
  const witnessed = new Set<string>(),
    seen = new Set<string>();
  let shortest: number | null = null,
    longest: number | null = null,
    incomplete = false;
  const invalid = diagnostics.some((d) =>
    [
      "STORY_CYCLE",
      "STORY_DANGLING_EDGE",
      "STORY_PORT_CONNECTION",
      "STORY_INVALID_PORT",
    ].includes(d.code),
  );
  if (!invalid) {
    try {
      const queue = [startSession(g)];
      let head = 0;
      const start = Date.now();
      while (head < queue.length) {
        if (
          seen.size >= limits.maxStates ||
          Date.now() - start > limits.budgetMs
        ) {
          incomplete = true;
          break;
        }
        const session = queue[head++],
          key = `${session.currentNodeId}:${session.edgeHistory.length}:${canonicalJSON(session.state)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (session.ended) {
          witnessed.add(session.currentNodeId);
          shortest = Math.min(shortest ?? Infinity, session.edgeHistory.length);
          longest = Math.max(longest ?? 0, session.edgeHistory.length);
          continue;
        }
        for (const c of listChoices(g, session).available)
          queue.push(stepSession(g, session, c.edgeId));
      }
    } catch {
      incomplete = true;
    }
  }
  return {
    nodes: g.nodes.length,
    scenes: g.nodes.filter((n) => n.type === "scene").length,
    decisions: g.nodes.filter((n) => n.type === "decision").length,
    endings: endings.length,
    convergenceNodes: convergences,
    witnessedEndings: [...witnessed],
    unreachableNodes: diagnostics
      .filter((d) => d.code.includes("UNREACHABLE"))
      .map((d) => d.nodeId),
    shortestWitnessedPath: shortest,
    longestWitnessedPath: longest,
    analysisIncomplete: incomplete || invalid,
    exploredStates: seen.size,
    proof: incomplete || invalid ? "unknown" : "proven",
    diagnostics,
  };
}
