import type { LocalStore } from "./localStore.ts";
import type { GraphDocument, SceneContent, StoryNode } from "./storyTypes.ts";
import { emptyGraph } from "./storySchema.ts";
import { saveGraphInStore } from "./storyPersistence.ts";
import { canonicalStoryLanguages } from "./storyLocalization.ts";
export const emptySceneContent = (): SceneContent => ({
  synopsis: {},
  visualPrompt: {},
  decisionPrompt: {},
  transitionMode: "continue",
  dialogue: [],
});
export function changeSceneTransition(
  document: GraphDocument,
  nodeId: string,
  mode: "continue" | "choice",
  retainedChoiceId?: string,
): GraphDocument {
  const g = structuredClone(document),
    node = g.nodes.find((n) => n.id === nodeId);
  if (!node?.content) throw new Error("Select a scene with authored content");
  if (mode === node.content.transitionMode) return g;
  const outgoing = g.edges.filter((e) => e.sourceNodeId === nodeId);
  if (mode === "choice") {
    const next = outgoing.find((e) => e.sourcePort === "next");
    const choiceId = crypto.randomUUID();
    node.choices = next
      ? [
          {
            id: choiceId,
            label: { [g.defaultLanguage]: "Continue" },
            condition: null,
            effects: [],
            sourceRefs: [],
            tags: [],
            iconAssetId: null,
            historicalAnnotation: {},
            educationalExplanation: {},
          },
        ]
      : [];
    if (next) next.sourcePort = choiceId;
  } else {
    if (outgoing.length > 1 && !retainedChoiceId)
      throw new Error("Choose the branch to retain");
    const keep =
      outgoing.find((e) => e.sourcePort === retainedChoiceId) ??
      (outgoing.length === 1 ? outgoing[0] : undefined);
    if (retainedChoiceId && !keep) throw new Error("Choose a connected branch");
    g.edges = g.edges.filter(
      (e) => e.sourceNodeId !== nodeId || e.id === keep?.id,
    );
    if (keep) keep.sourcePort = "next";
    node.choices = [];
  }
  node.content.transitionMode = mode;
  return g;
}
export function createSceneBlueprint(store: LocalStore, title = "New scene") {
  const episode =
    store.rows("episodes")[0] ??
    store.insert("episodes", [
      {
        project_id: store.projectId,
        code: "STORY",
        title: "Interactive story",
      },
    ])[0];
  const board =
    store
      .rows("storyboards")
      .find((b) => b.episode_id === episode.id && b.status !== "approved") ??
    store.insert("storyboards", [
      {
        episode_id: episode.id,
        version: 1,
        status: "draft",
        meta: { interactive_blueprint: true },
      },
    ])[0];
  const scene = store.insert("scenes", [
    {
      storyboard_id: board.id,
      idx:
        Math.max(
          -1,
          ...store
            .rows("scenes")
            .filter((s) => s.storyboard_id === board.id)
            .map((s) => Number(s.idx) || 0),
        ) + 1,
      slug: title,
      duration_ms: 4000,
      cast_ids: [],
      scene_prompt: "",
      meta: { interactive_blueprint: true },
    },
  ])[0];
  store.insert("beats", [
    {
      scene_id: scene.id,
      idx: 0,
      duration_ms: 4000,
      camera: "Medium shot",
      action: "",
      dialogue: [],
      sfx: [],
      meta: { interactive_blueprint: true },
    },
  ]);
  return scene;
}
export function newStoryInStore(
  store: LocalStore,
  title: string,
  defaultLanguage = "lv",
  additionalLanguages: string[] = [],
) {
  const locales = canonicalStoryLanguages(defaultLanguage, additionalLanguages);
  const document = emptyGraph();
  return saveGraphInStore(
    store,
    { expected_revision: 0, document, title },
    undefined,
    () => {
      const scene = createSceneBlueprint(store, "Scene 1");
      const common = {
        condition: null,
        enterEffects: [],
        sourceRefs: [],
        tags: [],
      };
      const start: StoryNode = {
        id: crypto.randomUUID(),
        type: "start",
        title: { [locales.defaultLanguage]: "START" },
        ...common,
      };
      const middle: StoryNode = {
        id: crypto.randomUUID(),
        type: "scene",
        sceneId: scene.id,
        title: { [locales.defaultLanguage]: "Scene 1" },
        content: emptySceneContent(),
        choices: [],
        ...common,
      };
      const end = {
        ...document.nodes[0],
        title: { [locales.defaultLanguage]: "END" },
        historicalExplanation: {},
        educationalSummary: {},
      };
      document.schemaVersion = 2;
      document.engineVersion = "2.0.0";
      document.languages = locales.languages;
      document.defaultLanguage = locales.defaultLanguage;
      document.entryNodeId = start.id;
      document.nodes = [start, middle, end];
      document.edges = [
        [start.id, middle.id],
        [middle.id, end.id],
      ].map(([sourceNodeId, targetNodeId]) => ({
        id: crypto.randomUUID(),
        sourceNodeId,
        targetNodeId,
        sourcePort: "next",
        label: "",
        condition: null,
        effects: [],
      }));
      document.editor.positions = {
        [start.id]: { x: 40, y: 160 },
        [middle.id]: { x: 360, y: 160 },
        [end.id]: { x: 680, y: 160 },
      };
    },
  );
}
export function migrateStoryDocument(
  document: GraphDocument,
  store?: LocalStore,
): GraphDocument {
  if (document.schemaVersion === 2) return structuredClone(document);
  const language = document.defaultLanguage;
  const g: GraphDocument = {
    ...structuredClone(document),
    schemaVersion: 2,
    engineVersion: "2.0.0",
    languages: [language],
  };
  for (const n of g.nodes) {
    n.title = { [language]: String(n.title) };
    for (const key of [
      "prompt",
      "explanation",
      "historicalExplanation",
      "educationalSummary",
    ] as const)
      if (n[key] !== undefined) n[key] = { [language]: String(n[key]) };
    for (const c of n.choices ?? []) {
      c.label = { [language]: String(c.label) };
      c.historicalAnnotation = { [language]: String(c.historicalAnnotation) };
      c.educationalExplanation = {
        [language]: String(c.educationalExplanation),
      };
    }
    for (const c of n.cases ?? []) c.label = { [language]: String(c.label) };
    if (n.type === "scene") {
      n.content = emptySceneContent();
      n.choices = [];
      const scene = store?.find("scenes", n.sceneId!);
      n.content.visualPrompt = { [language]: scene?.scene_prompt ?? "" };
      n.content.dialogue = (
        store
          ?.rows("beats")
          .filter((b) => b.scene_id === n.sceneId)
          .sort((a, b) => a.idx - b.idx) ?? []
      ).flatMap((b) =>
        (b.dialogue ?? []).map((line: any) => ({
          id: crypto.randomUUID(),
          speakerId: line.speaker_id ?? null,
          text: { [line.language ?? language]: line.line ?? "" },
          delivery: { [language]: line.delivery ?? "" },
          emotion: line.emotion ?? "neutral",
          intensity: line.intensity ?? 0,
          pace: line.pace ?? 1,
          offscreen: !!line.offscreen,
        })),
      );
      for (const line of n.content.dialogue)
        for (const locale of Object.keys(line.text))
          if (!g.languages.includes(locale)) g.languages.push(locale);
    }
  }
  const id = crypto.randomUUID();
  g.nodes.unshift({
    id,
    type: "start",
    title: { [language]: "START" },
    condition: null,
    enterEffects: [],
    sourceRefs: [],
    tags: [],
  });
  g.edges.unshift({
    id: crypto.randomUUID(),
    sourceNodeId: id,
    targetNodeId: g.entryNodeId,
    sourcePort: "next",
    label: "",
    condition: null,
    effects: [],
  });
  g.entryNodeId = id;
  g.editor.positions[id] = { x: 0, y: 0 };
  return g;
}
export function appendStoryScene(store: LocalStore, graph: any) {
  const document = structuredClone(graph.document) as GraphDocument;
  return saveGraphInStore(
    store,
    {
      graph_id: graph.id,
      expected_revision: graph.revision,
      document,
      title: graph.title,
      reason: "Create scene blueprint",
    },
    undefined,
    () => {
      const scene = createSceneBlueprint(store);
      const node: StoryNode = {
        id: crypto.randomUUID(),
        type: "scene",
        sceneId: scene.id,
        title: { [document.defaultLanguage]: "New scene" },
        content: emptySceneContent(),
        choices: [],
        condition: null,
        enterEffects: [],
        sourceRefs: [],
        tags: [],
      };
      document.nodes.push(node);
      document.editor.positions[node.id] = {
        x: 200 + document.nodes.length * 40,
        y: 300,
      };
    },
  );
}
