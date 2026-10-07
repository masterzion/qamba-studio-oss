// Synthetic acceptance fixture only. No generated or historical-media claim.
import { fixtureStore, paths } from "./storyTestFixture.ts";
import { migrateStoryDocument } from "./storyAuthoring.ts";
import { saveGraphInStore } from "./storyPersistence.ts";
export function storyV2Fixture() {
  const { store, graph: original } = fixtureStore(),
    d = migrateStoryDocument(original.document, store);
  d.languages = ["lv", "en"];
  const station = d.nodes.find((n) => n.type === "scene")!,
    decision = d.nodes.find((n) => n.type === "decision")!,
    oldConnector = d.edges.find(
      (e) => e.sourceNodeId === station.id && e.targetNodeId === decision.id,
    )!;
  station.content!.transitionMode = "choice";
  station.content!.decisionPrompt = {
    lv: "Ko darīt tālāk?",
    en: "What should we do next?",
  };
  station.choices = decision.choices;
  station.choices![0].label = { lv: "Paslēpties", en: "Hide" };
  station.choices![1].label = { lv: "Skriet", en: "Run" };
  d.nodes = d.nodes.filter((n) => n.id !== decision.id);
  delete d.editor.positions[decision.id];
  d.edges = d.edges
    .filter((e) => e.id !== oldConnector.id)
    .map((e) =>
      e.sourceNodeId === decision.id ? { ...e, sourceNodeId: station.id } : e,
    );
  for (const n of d.nodes) {
    const english = typeof n.title === "object" ? n.title.lv : n.title;
    n.title = {
      lv:
        (
          {
            Station: "Stacija",
            Cellar: "Pagrabs",
            Forest: "Mežs",
            "Shared scene": "Kopīgā aina",
          } as Record<string, string>
        )[english] ?? english,
      en: english,
    };
    if (n.type === "ending") {
      n.educationalSummary = {
        lv: "Izvēle mainīja stāsta iznākumu.",
        en: "The choice changed the story's outcome.",
      };
      n.historicalExplanation = {
        lv: "Izdomāts pārbaudes stāsts.",
        en: "A fictional acceptance story.",
      };
    }
    for (const c of n.cases ?? [])
      c.label = { lv: "Ievainojuma pārbaude", en: "Injury check" };
    for (const c of n.choices ?? []) {
      c.historicalAnnotation = { lv: "Izdomāts stāsts", en: "Fictional story" };
      c.educationalExplanation = {
        lv: "Izvēlei ir sekas",
        en: "Choices have consequences",
      };
    }
    if (n.content) {
      n.content.synopsis = {
        lv: `Aina: ${(n.title as any).lv}`,
        en: `Scene: ${english}`,
      };
      n.content.visualPrompt = {
        lv: "Sintētiska pārbaudes aina",
        en: "Synthetic acceptance scene",
      };
      n.content.dialogue = [
        {
          id: crypto.randomUUID(),
          speakerId: null,
          text: {
            lv: "Rīga — mūsu izvēlei ir nozīme.",
            en: "Our choice matters in Riga.",
          },
          delivery: { lv: "Runā skaidri", en: "Speak clearly" },
          emotion: "neutral",
          intensity: 0,
          pace: 1,
          offscreen: false,
        },
      ];
      store.insert("beats", [
        {
          scene_id: n.sceneId,
          idx: 0,
          duration_ms: 4000,
          camera: "Medium shot",
          action: "Synthetic",
          dialogue: [],
          sfx: [],
        },
      ]);
    }
  }
  const graph = saveGraphInStore(store, {
    graph_id: original.id,
    expected_revision: original.revision,
    document: d,
  });
  const witnesses = paths.map((p) => ({
    ...p,
    edgeIds: [
      d.edges[0].id,
      ...p.edgeIds.filter((id) => id !== oldConnector.id),
    ],
  }));
  return { store, graph, paths: witnesses };
}
