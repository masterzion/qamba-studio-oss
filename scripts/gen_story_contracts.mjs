import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../contracts/story/v1");
fs.mkdirSync(path.join(dir, "fixtures"), { recursive: true });
const write = (file, value) =>
  fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + "\n");
const id = (prefix, n) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const node = (n, type, title, rest = {}) => ({
  id: id(1, n),
  type,
  title,
  condition: null,
  enterEffects: [],
  sourceRefs: [],
  tags: [],
  ...rest,
});
const choice = (n, label, effects) => ({
  id: id(4, n),
  label,
  iconAssetId: null,
  condition: null,
  effects,
  historicalAnnotation: "Fictional test narrative",
  educationalExplanation: "Synthetic conformance fixture",
  sourceRefs: [],
  tags: [],
});
const characterId = id(5, 1);
const fixture = {
  schemaVersion: 1,
  engineVersion: "1.0.0",
  entryNodeId: id(1, 1),
  defaultLanguage: "lv",
  nodes: [
    node(1, "scene", "Station", { sceneId: id(3, 1) }),
    node(2, "decision", "Choose a route", {
      prompt: "What should Anna do?",
      choices: [
        choice(1, "Hide", [
          { operation: "decrement", path: "variables.suspicion", value: 10 },
        ]),
        choice(2, "Run", [
          { operation: "increment", path: "variables.suspicion", value: 15 },
          { operation: "set", path: "flags.injured", value: true },
          {
            operation: "add",
            path: `characters.${characterId}.injuries`,
            value: "leg_injury",
          },
        ]),
      ],
    }),
    node(3, "scene", "Cellar", { sceneId: id(3, 2) }),
    node(4, "scene", "Forest", { sceneId: id(3, 3) }),
    node(5, "scene", "Shared scene", { sceneId: id(3, 4) }),
    node(6, "conditional", "Injury consequence", {
      cases: [
        {
          id: id(4, 3),
          label: "Injured",
          condition: { path: "flags.injured", operator: "eq", value: true },
        },
      ],
    }),
    node(7, "ending", "Together", {
      classification: "mixed",
      outcomes: { family: 80 },
      historicalExplanation: "Fictional example",
      educationalSummary: "Choices persist after reconvergence",
    }),
    node(8, "ending", "Recovery", {
      classification: "mixed",
      outcomes: { family: 50 },
      historicalExplanation: "Fictional example",
      educationalSummary: "Injury changes the outcome",
    }),
  ],
  edges: [
    [1, 2, "next"],
    [2, 3, id(4, 1)],
    [2, 4, id(4, 2)],
    [3, 5, "next"],
    [4, 5, "next"],
    [5, 6, "next"],
    [6, 8, id(4, 3)],
    [6, 7, "fallback"],
  ].map(([a, b, port], i) => ({
    id: id(2, i + 1),
    sourceNodeId: id(1, a),
    targetNodeId: id(1, b),
    sourcePort: port,
    label: "",
    condition: null,
    effects: [],
  })),
  stateDefinitions: {
    paths: {
      "variables.suspicion": { type: "number", default: 20, min: 0, max: 100 },
      "flags.injured": { type: "boolean", default: false },
      [`characters.${characterId}.injuries`]: {
        type: "set",
        default: [],
        values: ["leg_injury"],
      },
    },
  },
  initialState: {
    variables: { suspicion: 20 },
    flags: { injured: false },
    characters: { [characterId]: { injuries: [] } },
  },
  editor: {
    positions: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        id(1, i + 1),
        { x: (i % 4) * 260, y: Math.floor(i / 4) * 230 },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  metadata: { fixture: true, historicalClassification: "FICTIONAL" },
};
write("fixtures/reconvergence.json", fixture);
write("fixtures/invalid-cases.json", [
  {
    label: "unsafe path",
    condition: { path: "__proto__.polluted", operator: "eq", value: true },
  },
  {
    label: "invalid effect",
    effect: { operation: "eval", path: "variables.suspicion", value: "code" },
  },
]);
const uuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
};
const scalar = { type: ["string", "number", "boolean", "null"] };
const obj = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const list = (items) => ({ type: "array", items });
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const citation = obj({
  sourceId: uuid,
  locator: { type: "string" },
  excerpt: { type: ["string", "null"] },
  note: { type: "string" },
});
const effects = {
  type: "array",
  maxItems: 256,
  items: obj({
    operation: { enum: ["set", "increment", "decrement", "add", "remove"] },
    path: { type: "string" },
    value: { anyOf: [scalar, list({ type: "string" })] },
  }),
};
const defs = {
  condition: {
    anyOf: [
      { type: "null" },
      obj({ all: { type: "array", minItems: 1, items: ref("condition") } }),
      obj({ any: { type: "array", minItems: 1, items: ref("condition") } }),
      obj({ not: ref("condition") }),
      obj(
        {
          path: { type: "string" },
          operator: {
            enum: [
              "eq",
              "neq",
              "gt",
              "gte",
              "lt",
              "lte",
              "contains",
              "notContains",
              "exists",
              "notExists",
            ],
          },
          value: scalar,
        },
        ["path", "operator"],
      ),
    ],
  },
  citation,
};
const common = {
  id: uuid,
  title: { type: "string" },
  condition: ref("condition"),
  enterEffects: effects,
  sourceRefs: list(citation),
  tags: list({ type: "string" }),
};
const choiceSchema = obj({
  id: uuid,
  label: { type: "string" },
  iconAssetId: { anyOf: [uuid, { type: "null" }] },
  condition: ref("condition"),
  effects,
  historicalAnnotation: { type: "string" },
  educationalExplanation: { type: "string" },
  sourceRefs: list(citation),
  tags: list({ type: "string" }),
});
const types = {
  base_sound_track: { soundtrackPaths: list({ type: "string", minLength: 1 }) },
  scene: {
    sceneId: uuid,
    presentation: obj({
      subtitleAssetId: { anyOf: [uuid, { type: "null" }] },
      posterAssetId: { anyOf: [uuid, { type: "null" }] },
    }),
  },
  decision: { prompt: { type: "string" }, choices: list(choiceSchema), choiceTimer: {
    type: "object", properties: { enabled: { type: "boolean" }, durationMs: { type: "integer", minimum: 1 } },
    required: ["enabled", "durationMs"], additionalProperties: false,
  } },
  conditional: {
    cases: list(
      obj({ id: uuid, label: { type: "string" }, condition: ref("condition") }),
    ),
  },
  historical_event: {
    historicalEntryId: uuid,
    explanation: { type: "string" },
  },
  ending: {
    classification: { type: "string" },
    outcomes: { type: "object", additionalProperties: scalar },
    historicalExplanation: { type: "string" },
    educationalSummary: { type: "string" },
  },
};
const nodes = Object.entries(types).map(([type, properties]) =>
  obj({ ...common, type: { const: type }, ...properties }, [
    ...Object.keys(common),
    "type",
    ...Object.keys(properties).filter((k) => !["presentation", "choiceTimer"].includes(k)),
  ]),
);
const declaration = obj(
  {
    type: { enum: ["number", "string", "boolean", "set"] },
    default: { anyOf: [scalar, list({ type: "string" })] },
    optional: { type: "boolean" },
    nullable: { type: "boolean" },
    min: { type: "number" },
    max: { type: "number" },
    values: list(scalar),
  },
  ["type"],
);
const graph = obj({
  schemaVersion: { const: 1 },
  engineVersion: { const: "1.0.0" },
  entryNodeId: uuid,
  defaultLanguage: { type: "string" },
  nodes: list({ oneOf: nodes }),
  edges: list(
    obj({
      id: uuid,
      sourceNodeId: uuid,
      targetNodeId: uuid,
      sourcePort: { type: "string" },
      label: { type: "string" },
      condition: ref("condition"),
      effects,
    }),
  ),
  stateDefinitions: obj({
    paths: {
      type: "object",
      additionalProperties: declaration,
      minProperties: 1,
    },
  }),
  initialState: { type: "object" },
  editor: obj({
    positions: {
      type: "object",
      additionalProperties: obj({
        x: { type: "number" },
        y: { type: "number" },
      }),
    },
    viewport: obj({
      x: { type: "number" },
      y: { type: "number" },
      zoom: { type: "number", exclusiveMinimum: 0 },
    }),
  }),
  metadata: { type: "object" },
});
graph.required = graph.required.filter((key) => key !== "editor");
write("graph.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  ...graph,
  $defs: defs,
});
write("state.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  description:
    "Leaf paths and value domains are declared by GraphDocument.stateDefinitions and enforced by the shared runtime.",
});
write("package.schema.json", {
  $schema: "http://json-schema.org/draft-07/schema#",
  ...obj({
    format: { const: "chronolatvia-interactive-story" },
    formatVersion: { const: 1 },
    storyId: uuid,
    graphRevision: { type: "integer", minimum: 1 },
    engineVersion: { const: "1.0.0" },
    entryNodeId: uuid,
    language: { type: "string" },
    title: { type: "string" },
    files: list(
      obj({
        path: { type: "string" },
        sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        bytes: { type: "integer", minimum: 0 },
        contentType: { type: "string" },
      }),
    ),
    contentHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
  }),
});
write("runtime-conformance.json", {
  engineVersion: "1.0.0",
  cases: [
    {
      name: "hide",
      edgeIds: [1, 2, 4, 6, 8].map((n) => id(2, n)),
      endingId: id(1, 7),
      suspicion: 10,
      injured: false,
    },
    {
      name: "run",
      edgeIds: [1, 3, 5, 6, 7].map((n) => id(2, n)),
      endingId: id(1, 8),
      suspicion: 35,
      injured: true,
    },
  ],
});
console.log("Generated versioned story schemas and synthetic fixtures");
const v2dir = path.resolve(dir, "../v2");
fs.mkdirSync(v2dir, { recursive: true });
const localized = { type: "object", additionalProperties: { type: "string" } };
const content = obj({
  synopsis: localized,
  visualPrompt: localized,
  decisionPrompt: localized,
  transitionMode: { enum: ["continue", "choice"] },
  dialogue: list(
    obj({
      id: uuid,
      speakerId: { anyOf: [uuid, { type: "null" }] },
      text: localized,
      delivery: localized,
      emotion: { type: "string" },
      intensity: { type: "number", minimum: 0, maximum: 1 },
      pace: { type: "number", exclusiveMinimum: 0 },
      offscreen: { type: "boolean" },
    }),
  ),
});
const v2 = structuredClone(graph);
v2.properties.schemaVersion = { const: 2 };
v2.properties.engineVersion = { const: "2.0.0" };
v2.properties.languages = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { type: "string" },
};
v2.required.push("languages");
for (const n of v2.properties.nodes.items.oneOf) {
  n.properties.title = localized;
  for (const key of [
    "prompt",
    "explanation",
    "historicalExplanation",
    "educationalSummary",
  ])
    if (n.properties[key]) n.properties[key] = localized;
  if (n.properties.cases) n.properties.cases.items.properties.label = localized;
  if (n.properties.type.const === "scene") {
    n.properties.content = content;
    n.properties.choices = list({
      ...structuredClone(choiceSchema),
      properties: {
        ...choiceSchema.properties,
        label: localized,
        historicalAnnotation: localized,
        educationalExplanation: localized,
      },
    });
    n.required.push("content", "choices");
  }
  if (n.properties.type.const === "decision")
    for (const key of [
      "label",
      "historicalAnnotation",
      "educationalExplanation",
    ])
      n.properties.choices.items.properties[key] = localized;
}
v2.properties.nodes.items.oneOf.push(
  obj({
    ...common,
    title: localized,
    type: { const: "start" },
    condition: { type: "null" },
    enterEffects: { type: "array", maxItems: 0 },
  }),
);
fs.writeFileSync(
  path.join(v2dir, "graph.schema.json"),
  JSON.stringify(
    { $schema: "http://json-schema.org/draft-07/schema#", ...v2, $defs: defs },
    null,
    2,
  ) + "\n",
);
const packageV2 = JSON.parse(
  fs.readFileSync(path.join(dir, "package.schema.json"), "utf8"),
);
fs.writeFileSync(
  path.join(v2dir, "state.schema.json"),
  fs.readFileSync(path.join(dir, "state.schema.json")),
);
packageV2.properties.formatVersion = { const: 2 };
packageV2.properties.engineVersion = { const: "2.0.0" };
packageV2.properties.playable = { type: "boolean" };
packageV2.properties.languages = {
  type: "array",
  items: { type: "string" },
  minItems: 1,
};
packageV2.required.push("playable", "languages");
fs.writeFileSync(
  path.join(v2dir, "package.schema.json"),
  JSON.stringify(packageV2, null, 2) + "\n",
);
