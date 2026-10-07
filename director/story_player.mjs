import {
  startSession,
  listChoices,
  stepSession,
  replaySession,
  evaluateCondition,
  canonicalJSON,
  resolveText,
  resolveLocalizedText,
} from "./story_runtime.js";
export function createStoryPlayer(
  { manifest, graph, scenes },
  { language = graph.defaultLanguage, subtitleLanguage = language } = {},
) {
  if (manifest.engineVersion && manifest.engineVersion !== graph.engineVersion)
    throw new Error("Package and graph runtime versions differ");
  if (
    !(graph.languages ?? [graph.defaultLanguage]).includes(language) ||
    !(graph.languages ?? [graph.defaultLanguage]).includes(subtitleLanguage)
  )
    throw new Error("Choose a declared story language");
  if (manifest.playable === false)
    throw new Error(
      "This is an authoring package; approved media is required for playback",
    );
  let session = startSession({
      id: manifest.storyId,
      revision: manifest.graphRevision,
      document: graph,
    }),
    nonce = 0,
    finished = false;
  const automatic = () => {
    for (let i = 0; i < 1000; i++) {
      const node = graph.nodes.find((n) => n.id === session.currentNodeId);
      if (!["start", "conditional", "historical_event"].includes(node.type))
        return;
      const choices = listChoices(
        {
          id: manifest.storyId,
          revision: manifest.graphRevision,
          document: graph,
        },
        session,
      ).available;
      if (choices.length !== 1)
        throw new Error("No unique automatic transition");
      session = stepSession(
        {
          id: manifest.storyId,
          revision: manifest.graphRevision,
          document: graph,
        },
        session,
        choices[0].edgeId,
      );
    }
    throw new Error("Automatic transition limit exceeded");
  };
  automatic();
  const api = {
    current() {
      const node = graph.nodes.find((n) => n.id === session.currentNodeId);
      const matching = (
        scenes.find((s) => s.nodeId === node.id)?.variants ?? []
      ).filter(
        (v) =>
          (v.speechLanguage ?? graph.defaultLanguage) === language &&
          evaluateCondition(v.when, session.state, graph.stateDefinitions).ok,
      );
      if (node.type === "scene" && matching.length !== 1)
        throw new Error(
          "Scene needs exactly one presentation in this language and state",
        );
      return {
        node,
        title: resolveText(node.title, language, graph.defaultLanguage),
        titleLocalization: resolveLocalizedText(
          node.title,
          language,
          graph.defaultLanguage,
        ),
        historicalExplanation: resolveText(
          node.historicalExplanation,
          language,
          graph.defaultLanguage,
        ),
        educationalSummary: resolveText(
          node.educationalSummary,
          language,
          graph.defaultLanguage,
        ),
        presentation: matching[0],
        subtitlePath: matching[0]?.subtitles?.[subtitleLanguage],
        ended: session.ended,
        nonce,
        choices:
          finished || node.type !== "scene"
            ? listChoices(
                {
                  id: manifest.storyId,
                  revision: manifest.graphRevision,
                  document: graph,
                },
                session,
              ).available.map((c) => ({
                ...c,
                label: resolveText(c.label, language, graph.defaultLanguage),
                localization: resolveLocalizedText(
                  c.label,
                  language,
                  graph.defaultLanguage,
                ),
              }))
            : [],
      };
    },
    finishVideo(token) {
      if (token !== nonce || finished || session.ended) return false;
      finished = true;
      return true;
    },
    choose(edgeId, token) {
      if (
        token !== nonce ||
        session.ended ||
        (!finished &&
          graph.nodes.find((n) => n.id === session.currentNodeId)?.type ===
            "scene")
      )
        throw new Error("Stale or premature decision");
      const allowed = api.current().choices;
      if (!allowed.some((c) => c.edgeId === edgeId))
        throw new Error("Unavailable choice");
      session = stepSession(
        {
          id: manifest.storyId,
          revision: manifest.graphRevision,
          document: graph,
        },
        session,
        edgeId,
      );
      nonce++;
      finished = false;
      automatic();
      return api.current();
    },
    save() {
      return {
        storyId: manifest.storyId,
        graphRevision: manifest.graphRevision,
        graphHash: manifest.contentHash,
        language,
        subtitleLanguage,
        edgeHistory: [...session.edgeHistory],
      };
    },
    restore(saved) {
      if (
        saved.storyId !== manifest.storyId ||
        saved.graphRevision !== manifest.graphRevision ||
        saved.graphHash !== manifest.contentHash ||
        saved.language !== language
      )
        throw new Error("Save belongs to another graph revision or language");
      const candidate = replaySession(
        {
          id: manifest.storyId,
          revision: manifest.graphRevision,
          document: graph,
        },
        undefined,
        undefined,
        saved.edgeHistory,
      );
      session = candidate;
      automatic();
      nonce++;
      finished = false;
      return api.current();
    },
  };
  return api;
}
