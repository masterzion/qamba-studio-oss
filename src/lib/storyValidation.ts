import { validateGraph, UUID } from "../../director/story_runtime.js";
import type { GraphDocument, StoryDiagnostic } from "./storyTypes.ts";
import { storyPorts } from "./storyPorts.ts";
export interface StoryReferences {
  sceneIds?: Set<string>;
  historicalEntries?: Map<string, any>;
  sources?: Map<string, any>;
  productionUnits?: any[];
}
export function validateStory(
  g: GraphDocument,
  refs: StoryReferences = {},
  readiness = false,
): StoryDiagnostic[] {
  const issues: StoryDiagnostic[] = validateGraph(g).errors.map((e: any) => ({
    ...e,
    severity: "error",
  }));
  if (issues.length) return issues;
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const add = (
    code: string,
    message: string,
    nodeId?: string,
    edgeId?: string,
  ) => issues.push({ code, message, severity: "error", nodeId, edgeId });
  for (const e of g.edges) {
    if (!nodes.has(e.sourceNodeId) || !nodes.has(e.targetNodeId))
      add(
        "STORY_DANGLING_EDGE",
        "Edge has a missing node",
        e.sourceNodeId,
        e.id,
      );
  }
  for (const n of g.nodes) {
    if (readiness && g.schemaVersion === 2)
      for (const language of g.languages ?? []) {
        if (typeof n.title !== "object" || !n.title[language]?.trim())
          add(
            "STORY_TRANSLATION",
            `Translate this node's title into ${language}`,
            n.id,
          );
        for (const c of n.choices ?? [])
          if (typeof c.label !== "object" || !c.label[language]?.trim())
            add(
              "STORY_TRANSLATION",
              `Translate choice ${c.id} into ${language}`,
              n.id,
            );
        for (const line of n.content?.dialogue ?? [])
          if (!line.text[language]?.trim())
            add(
              "STORY_TRANSLATION",
              `Translate dialogue ${line.id} into ${language}`,
              n.id,
            );
        for (const [field, value] of Object.entries({
          prompt: n.prompt,
          explanation: n.explanation,
          historicalExplanation: n.historicalExplanation,
          educationalSummary: n.educationalSummary,
          synopsis: n.content?.synopsis,
          visualPrompt: n.content?.visualPrompt,
          decisionPrompt: n.content?.decisionPrompt,
        }))
          if (
            value &&
            typeof value === "object" &&
            Object.values(value).some((text) => text.trim()) &&
            !value[language]?.trim()
          )
            add(
              "STORY_TRANSLATION",
              `Translate ${field} into ${language}`,
              n.id,
            );
        for (const choice of n.choices ?? [])
          for (const field of [
            "historicalAnnotation",
            "educationalExplanation",
          ] as const) {
            const value = choice[field];
            if (
              typeof value === "object" &&
              Object.values(value).some((text) => text.trim()) &&
              !value[language]?.trim()
            )
              add(
                "STORY_TRANSLATION",
                `Translate choice ${field} into ${language}`,
                n.id,
              );
          }
      }
    const outgoing = g.edges.filter((e) => e.sourceNodeId === n.id);
    const ports = storyPorts(n).map((p) => p.id);
    if (
      (n.type === "decision" || n.content?.transitionMode === "choice") &&
      !n.choices?.length
    )
      add("STORY_EMPTY_DECISION", "Add at least one choice", n.id);
    if (n.type === "conditional" && !n.cases?.length)
      add("STORY_EMPTY_CONDITIONAL", "Add at least one case", n.id);
    for (const port of ports)
      if (outgoing.filter((e) => e.sourcePort === port).length !== 1)
        add(
          "STORY_PORT_CONNECTION",
          "Each port requires exactly one outgoing edge",
          n.id,
        );
    if (outgoing.some((e) => !ports.includes(e.sourcePort)))
      add("STORY_INVALID_PORT", "An edge uses an invalid source port", n.id);
    if (n.type === "scene" && refs.sceneIds && !refs.sceneIds.has(n.sceneId!))
      add("STORY_INVALID_SCENE", "Scene is missing from this project", n.id);
    for (const ref of [
      ...n.sourceRefs,
      ...(n.choices ?? []).flatMap((c) => c.sourceRefs),
    ])
      if (
        !UUID.test(ref.sourceId) ||
        (refs.sources && !refs.sources.has(ref.sourceId))
      )
        add("STORY_INVALID_SOURCE", "Citation source is missing", n.id);
    if (
      readiness &&
      n.type === "scene" &&
      !refs.productionUnits?.some(
        (u) =>
          u.node_id === n.id && u.status === "approved" && u.approved_asset_id,
      )
    )
      add(
        "STORY_MISSING_MEDIA",
        "Approve a scene production output before export",
        n.id,
      );
    if (n.type === "historical_event" && refs.historicalEntries) {
      const fact = refs.historicalEntries.get(n.historicalEntryId!)?.doc
        ?.historical;
      if (!fact)
        add("STORY_INVALID_HISTORY", "Historical record is missing", n.id);
      else if (
        readiness &&
        (fact.review?.status !== "approved" ||
          (fact.classification === "DOCUMENTED" &&
            (!fact.sourceRefs?.length || fact.mutable !== false)))
      )
        add(
          "STORY_HISTORY_UNREVIEWED",
          "Historical record needs approved evidence",
          n.id,
        );
    }
  }
  const reachable = new Set<string>(),
    active = new Set<string>(),
    done = new Set<string>();
  // Iterative traversal avoids exhausting the stack on an imported long graph.
  const stack = [g.entryNodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id) || !nodes.has(id)) continue;
    reachable.add(id);
    for (const e of g.edges)
      if (e.sourceNodeId === id) stack.push(e.targetNodeId);
  }
  const adjacency = new Map(
    g.nodes.map((n) => [
      n.id,
      g.edges.filter((e) => e.sourceNodeId === n.id).map((e) => e.targetNodeId),
    ]),
  );
  for (const root of nodes.keys()) {
    if (done.has(root)) continue;
    const walk: { id: string; index: number }[] = [{ id: root, index: 0 }];
    active.add(root);
    while (walk.length) {
      const f = walk.at(-1)!,
        next = adjacency.get(f.id) ?? [];
      if (f.index >= next.length) {
        active.delete(f.id);
        done.add(f.id);
        walk.pop();
        continue;
      }
      const child = next[f.index++];
      if (active.has(child)) {
        add("STORY_CYCLE", "Stories must not contain cycles", child);
        continue;
      }
      if (!done.has(child) && nodes.has(child)) {
        active.add(child);
        walk.push({ id: child, index: 0 });
      }
    }
  }
  if (!g.nodes.some((n) => n.type === "ending"))
    add("STORY_MISSING_ENDING", "Add an ending");
  for (const n of g.nodes)
    if (!reachable.has(n.id))
      add(
        n.type === "ending"
          ? "STORY_UNREACHABLE_ENDING"
          : "STORY_UNREACHABLE_NODE",
        "Node is unreachable from entry",
        n.id,
      );
  return issues;
}
