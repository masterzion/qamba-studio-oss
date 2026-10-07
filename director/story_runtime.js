// Versioned, provider-independent narrative engine. Export this exact module
// with a story; the editor and player must execute the same transition rules.
export const ENGINE_VERSION = "1.0.0";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const operators = new Set([
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
]);
const operations = new Set(["set", "increment", "decrement", "add", "remove"]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export class StoryError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "StoryError";
    this.code = code;
    this.details = details;
  }
}
const fail = (code, message) => {
  throw new StoryError(code, message);
};
export function canonicalJSON(value) {
  if (typeof value === "number" && !Number.isFinite(value))
    fail("STORY_INVALID_STATE", "Numbers must be finite");
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(Object.is(value, -0) ? 0 : value);
}
export function pathParts(path) {
  if (typeof path !== "string" || !path || path.length > 512)
    fail("STORY_INVALID_PATH", "A declared state path is required");
  const parts = path.split(".");
  if (
    parts.some(
      (p) =>
        forbidden.has(p) ||
        !(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p) || UUID.test(p)),
    )
  )
    fail("STORY_INVALID_PATH", `Unsafe state path: ${path}`);
  return parts;
}
function definition(path, definitions) {
  pathParts(path);
  if (!definitions?.paths || !own(definitions.paths, path))
    fail("STORY_INVALID_PATH", `Undeclared state path: ${path}`);
  return definitions.paths[path];
}
function read(state, path) {
  let value = state;
  for (const key of pathParts(path)) {
    if (!value || typeof value !== "object" || !own(value, key))
      return { exists: false, value: undefined };
    value = value[key];
  }
  return { exists: true, value };
}
function assign(state, path, value) {
  const parts = pathParts(path);
  let at = state;
  for (const key of parts.slice(0, -1)) {
    if (!own(at, key)) at[key] = {};
    if (!at[key] || typeof at[key] !== "object" || Array.isArray(at[key]))
      fail("STORY_INVALID_PATH", `Cannot write ${path}`);
    at = at[key];
  }
  at[parts.at(-1)] = clone(value);
}
function checkValue(value, d, path) {
  if (value === null && d.nullable) return;
  if (d.type === "set") {
    if (
      !Array.isArray(value) ||
      value.some((v) => typeof v !== "string") ||
      new Set(value).size !== value.length
    )
      fail("STORY_INVALID_STATE", `${path} must be a unique string set`);
    if (d.values && value.some((v) => !d.values.includes(v)))
      fail("STORY_INVALID_STATE", `${path} contains an unknown item`);
    return;
  }
  if (
    typeof value !== d.type ||
    !["number", "string", "boolean"].includes(d.type)
  )
    fail("STORY_INVALID_STATE", `${path} requires ${d.type}`);
  if (
    d.type === "number" &&
    (!Number.isFinite(value) ||
      (d.min != null && value < d.min) ||
      (d.max != null && value > d.max))
  )
    fail("STORY_INVALID_STATE", `${path} is outside its finite bounds`);
  if (d.values && !d.values.includes(value))
    fail("STORY_INVALID_STATE", `${path} is outside its enum`);
}
export function validateState(state, definitions) {
  const errors = [];
  try {
    if (!state || typeof state !== "object" || Array.isArray(state))
      fail("STORY_INVALID_STATE", "State must be an object");
    for (const [path, d] of Object.entries(definitions?.paths ?? {})) {
      definition(path, definitions);
      const result = read(state, path);
      if (!result.exists && !d.optional)
        fail("STORY_INVALID_STATE", `Missing state path: ${path}`);
      if (result.exists) checkValue(result.value, d, path);
    }
    function walk(value, prefix = "") {
      if (prefix && own(definitions.paths, prefix)) return;
      if (!value || typeof value !== "object" || Array.isArray(value))
        fail("STORY_INVALID_PATH", `Undeclared state value: ${prefix}`);
      for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        pathParts(path);
        if (
          !Object.keys(definitions.paths).some(
            (p) => p === path || p.startsWith(`${path}.`),
          )
        )
          fail("STORY_INVALID_PATH", `Undeclared state path: ${path}`);
        walk(child, path);
      }
    }
    if (!definitions?.paths || !Object.keys(definitions.paths).length)
      fail("STORY_INVALID_STATE", "State definitions must declare paths");
    walk(state);
  } catch (e) {
    errors.push({ code: e.code ?? "STORY_INVALID_STATE", message: e.message });
  }
  return { ok: !errors.length, errors };
}
export function initialStateFromDefinitions(definitions) {
  const state = {};
  for (const [path, d] of Object.entries(definitions.paths))
    if (own(d, "default")) assign(state, path, d.default);
  const result = validateState(state, definitions);
  if (!result.ok)
    throw new StoryError("STORY_INVALID_STATE", result.errors[0].message);
  return state;
}
export function validateCondition(condition, definitions) {
  let count = 0;
  function visit(c, depth) {
    if (c === null) return;
    if (
      !c ||
      typeof c !== "object" ||
      Array.isArray(c) ||
      depth > 16 ||
      ++count > 256
    )
      fail(
        "STORY_INVALID_CONDITION",
        "Invalid condition or condition limit exceeded",
      );
    const logical = ["all", "any", "not"].filter((k) => own(c, k));
    if (logical.length) {
      if (logical.length !== 1 || Object.keys(c).length !== 1)
        fail(
          "STORY_INVALID_CONDITION",
          "A condition has exactly one logical operation",
        );
      const k = logical[0];
      if (k === "not") {
        if (c.not === null)
          fail("STORY_INVALID_CONDITION", "not requires a condition");
        visit(c.not, depth + 1);
      } else {
        if (!Array.isArray(c[k]) || !c[k].length)
          fail("STORY_INVALID_CONDITION", `${k} requires nonempty predicates`);
        c[k].forEach((v) => visit(v, depth + 1));
      }
      return;
    }
    if (
      Object.keys(c).some((k) => !["path", "operator", "value"].includes(k)) ||
      !operators.has(c.operator)
    )
      fail("STORY_INVALID_CONDITION", "Unknown condition field/operator");
    const d = definition(c.path, definitions);
    if (["exists", "notExists"].includes(c.operator)) {
      if (own(c, "value"))
        fail("STORY_INVALID_CONDITION", "Existence predicates have no value");
      return;
    }
    if (!own(c, "value"))
      fail("STORY_INVALID_CONDITION", "Comparison value is required");
    if (
      ["gt", "gte", "lt", "lte"].includes(c.operator) &&
      (d.type !== "number" ||
        typeof c.value !== "number" ||
        !Number.isFinite(c.value))
    )
      fail("STORY_INVALID_CONDITION", "Ordering requires finite numbers");
    if (["contains", "notContains"].includes(c.operator)) {
      if (!["string", "set"].includes(d.type) || typeof c.value !== "string")
        fail("STORY_INVALID_CONDITION", "Membership requires a string or set");
    } else if (
      !["exists", "notExists", "gt", "gte", "lt", "lte"].includes(c.operator)
    ) {
      if (d.type === "set")
        fail("STORY_INVALID_CONDITION", "Use contains to compare sets");
      // Comparison thresholds need not be in a declared numeric domain.
      checkValue(
        c.value,
        { ...d, min: undefined, max: undefined, values: undefined },
        c.path,
      );
    }
  }
  visit(condition, 0);
  return true;
}
export function evaluateCondition(condition, state, definitions) {
  try {
    validateCondition(condition, definitions);
    function evaluate(c) {
      if (c === null) return true;
      if (own(c, "all")) return c.all.every(evaluate);
      if (own(c, "any")) return c.any.some(evaluate);
      if (own(c, "not")) return !evaluate(c.not);
      const { exists, value } = read(state, c.path);
      if (c.operator === "exists") return exists;
      if (c.operator === "notExists") return !exists;
      if (!exists) return false;
      switch (c.operator) {
        case "eq":
          return value === c.value;
        case "neq":
          return value !== c.value;
        case "gt":
          return value > c.value;
        case "gte":
          return value >= c.value;
        case "lt":
          return value < c.value;
        case "lte":
          return value <= c.value;
        case "contains":
          return value.includes(c.value);
        case "notContains":
          return !value.includes(c.value);
      }
      return false;
    }
    const ok = evaluate(condition);
    return {
      ok,
      reasons: ok
        ? []
        : [
            {
              code: "STORY_BLOCKED_TRANSITION",
              message: "Condition is not satisfied",
              condition,
              actual: condition?.path
                ? read(state, condition.path).value
                : undefined,
            },
          ],
    };
  } catch (e) {
    return { ok: false, reasons: [{ code: e.code, message: e.message }] };
  }
}
export function validateEffects(effects, definitions) {
  if (!Array.isArray(effects) || effects.length > 256)
    fail("STORY_INVALID_EFFECT", "Effects must be a bounded array");
  for (const effect of effects) {
    if (
      !effect ||
      Object.keys(effect).some(
        (k) => !["operation", "path", "value"].includes(k),
      ) ||
      !operations.has(effect.operation) ||
      !own(effect, "value")
    )
      fail("STORY_INVALID_EFFECT", "Invalid effect");
    const d = definition(effect.path, definitions);
    if (["increment", "decrement"].includes(effect.operation)) {
      if (
        d.type !== "number" ||
        typeof effect.value !== "number" ||
        !Number.isFinite(effect.value) ||
        effect.value < 0
      )
        fail(
          "STORY_INVALID_EFFECT",
          "Numeric deltas must be nonnegative finite numbers",
        );
    } else if (["add", "remove"].includes(effect.operation)) {
      if (
        d.type !== "set" ||
        typeof effect.value !== "string" ||
        (d.values && !d.values.includes(effect.value))
      )
        fail("STORY_INVALID_EFFECT", "Set operations require a known item");
    } else checkValue(effect.value, d, effect.path);
  }
  return true;
}
export function applyEffects(state, effects, definitions) {
  try {
    validateEffects(effects, definitions);
    const candidate = clone(state);
    for (const e of effects) {
      const current = read(candidate, e.path);
      let value = e.value;
      if (["increment", "decrement"].includes(e.operation)) {
        if (!current.exists || typeof current.value !== "number")
          fail("STORY_INVALID_EFFECT", `Missing numeric target: ${e.path}`);
        value =
          current.value + (e.operation === "increment" ? e.value : -e.value);
      } else if (["add", "remove"].includes(e.operation)) {
        if (!Array.isArray(current.value))
          fail("STORY_INVALID_EFFECT", `Missing set target: ${e.path}`);
        value =
          e.operation === "add"
            ? [...new Set([...current.value, e.value])].sort()
            : current.value.filter((v) => v !== e.value).sort();
      }
      checkValue(value, definition(e.path, definitions), e.path);
      assign(candidate, e.path, value);
    }
    const result = validateState(candidate, definitions);
    if (!result.ok)
      throw new StoryError("STORY_INVALID_EFFECT", result.errors[0].message);
    return { ok: true, state: candidate, errors: [] };
  } catch (e) {
    return {
      ok: false,
      errors: [{ code: e.code ?? "STORY_INVALID_EFFECT", message: e.message }],
    };
  }
}
function envelope(graph) {
  if (!graph || typeof graph !== "object") return { document: {} };
  return graph.document
    ? graph
    : {
        id: graph.id ?? "story",
        revision: graph.revision ?? 1,
        document: graph,
      };
}
export function resolveText(value, language = "lv", defaultLanguage = "lv") {
  return resolveLocalizedText(value, language, defaultLanguage).text;
}
export function resolveLocalizedText(
  value,
  language = "lv",
  defaultLanguage = "lv",
) {
  if (typeof value === "string")
    return {
      text: value,
      locale: defaultLanguage,
      fallback: language !== defaultLanguage,
    };
  for (const locale of [
    ...new Set([language, language.split("-")[0], defaultLanguage]),
  ]) {
    if (typeof value?.[locale] === "string" && value[locale].trim())
      return { text: value[locale], locale, fallback: locale !== language };
  }
  return { text: "", locale: null, fallback: false };
}
export function validateGraph(graph) {
  const { document: original } = envelope(graph);
  if (original.schemaVersion === 2) return validateGraphV2(original);
  const { document: g } = envelope(graph);
  const errors = [];
  const add = (code, message, nodeId) => errors.push({ code, message, nodeId });
  if (g.schemaVersion !== 1 || g.engineVersion !== ENGINE_VERSION)
    add("STORY_VERSION", "Unsupported graph or runtime version");
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges))
    return {
      ok: false,
      errors: [
        {
          code: "STORY_INVALID_GRAPH",
          message: "Nodes and edges are required",
        },
      ],
    };
  const object = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const keys = (v, allowed, label) => {
    if (!object(v)) {
      add("STORY_INVALID_GRAPH", `${label} must be an object`);
      return false;
    }
    for (const key of Object.keys(v))
      if (!allowed.includes(key))
        add("STORY_UNKNOWN_FIELD", `Unknown ${label} field: ${key}`);
    return true;
  };
  keys(
    g,
    [
      "schemaVersion",
      "engineVersion",
      "entryNodeId",
      "defaultLanguage",
      "nodes",
      "edges",
      "stateDefinitions",
      "initialState",
      "editor",
      "metadata",
    ],
    "graph",
  );
  if (
    !object(g.stateDefinitions?.paths) ||
    !object(g.initialState) ||
    (g.editor !== undefined &&
      (!object(g.editor?.positions) || !object(g.editor?.viewport))) ||
    !object(g.metadata) ||
    typeof g.defaultLanguage !== "string"
  )
    return {
      ok: false,
      errors: [
        ...errors,
        {
          code: "STORY_INVALID_GRAPH",
          message:
            "Graph definitions, initial state, language and metadata are required",
        },
      ],
    };
  const citations = (refs, label) => {
    if (!Array.isArray(refs)) {
      add("STORY_INVALID_SOURCE", `${label} citations must be an array`);
      return;
    }
    for (const ref of refs)
      if (
        keys(ref, ["sourceId", "locator", "excerpt", "note"], "citation") &&
        (!UUID.test(ref.sourceId) ||
          typeof ref.locator !== "string" ||
          typeof ref.note !== "string" ||
          (ref.excerpt !== null && typeof ref.excerpt !== "string"))
      )
        add("STORY_INVALID_SOURCE", "Malformed citation");
  };
  if (g.nodes.length > 10000 || g.edges.length > 50000)
    add("STORY_LIMIT", "Graph exceeds authoring limits");
  const ids = new Set();
  const identity = (id, label) => {
    if (!UUID.test(id) || ids.has(id))
      add("STORY_INVALID_ID", `Invalid/duplicate ${label}: ${id}`);
    ids.add(id);
  };
  for (const n of g.nodes) {
    if (!object(n)) {
      add("STORY_INVALID_NODE", "Node must be an object");
      continue;
    }
    const extra =
      {
        scene: ["sceneId", "presentation"],
        decision: ["prompt", "choices"],
        conditional: ["cases"],
        historical_event: ["historicalEntryId", "explanation"],
        ending: [
          "classification",
          "outcomes",
          "historicalExplanation",
          "educationalSummary",
        ],
      }[n.type] ?? [];
    keys(
      n,
      [
        "id",
        "type",
        "title",
        "condition",
        "enterEffects",
        "sourceRefs",
        "tags",
        ...extra,
      ],
      "node",
    );
    citations(n.sourceRefs, "Node");
    if (!Array.isArray(n.tags) || n.tags.some((t) => typeof t !== "string"))
      add("STORY_INVALID_NODE", "Node tags must be strings", n.id);
    if (
      n.type === "decision" &&
      (typeof n.prompt !== "string" || !Array.isArray(n.choices))
    )
      add("STORY_INVALID_NODE", "Decision requires prompt and choices", n.id);
    if (n.type === "conditional" && !Array.isArray(n.cases))
      add("STORY_INVALID_NODE", "Conditional requires cases", n.id);
    if (
      n.type === "ending" &&
      (!object(n.outcomes) ||
        typeof n.classification !== "string" ||
        typeof n.historicalExplanation !== "string" ||
        typeof n.educationalSummary !== "string")
    )
      add(
        "STORY_INVALID_NODE",
        "Ending requires classification, outcomes and explanations",
        n.id,
      );
    identity(n.id, "node");
    if (
      ![
        "scene",
        "decision",
        "conditional",
        "historical_event",
        "ending",
      ].includes(n.type)
    )
      add("STORY_INVALID_NODE", "Unknown node type", n.id);
    if (typeof n.title !== "string")
      add("STORY_INVALID_NODE", "Node title is required", n.id);
    if (n.type === "scene" && !UUID.test(n.sceneId))
      add("STORY_INVALID_SCENE", "Scene UUID is required", n.id);
    if (n.type === "historical_event" && !UUID.test(n.historicalEntryId))
      add("STORY_INVALID_HISTORY", "Historical entry UUID is required", n.id);
    if (n.type === "historical_event" && typeof n.explanation !== "string")
      add("STORY_INVALID_HISTORY", "Historical explanation is required", n.id);
    if (!own(n, "condition"))
      add(
        "STORY_INVALID_NODE",
        "Node condition is required (use null for no condition)",
        n.id,
      );
    if (
      n.presentation !== undefined &&
      (!object(n.presentation) ||
        Object.keys(n.presentation).some(
          (k) => !["posterAssetId", "subtitleAssetId"].includes(k),
        ) ||
        [n.presentation.posterAssetId, n.presentation.subtitleAssetId].some(
          (id) => id !== null && !UUID.test(id),
        ))
    )
      add(
        "STORY_INVALID_NODE",
        "Scene presentation requires nullable asset UUIDs",
        n.id,
      );
    try {
      validateCondition(n.condition, g.stateDefinitions);
      validateEffects(n.enterEffects, g.stateDefinitions);
    } catch (e) {
      add(e.code, e.message, n.id);
    }
    for (const c of Array.isArray(n.choices ?? n.cases)
      ? (n.choices ?? n.cases)
      : []) {
      if (!object(c)) {
        add("STORY_INVALID_NODE", "Port must be an object", n.id);
        continue;
      }
      keys(
        c,
        n.type === "decision"
          ? [
              "id",
              "label",
              "iconAssetId",
              "condition",
              "effects",
              "historicalAnnotation",
              "educationalExplanation",
              "sourceRefs",
              "tags",
            ]
          : ["id", "label", "condition"],
        "port",
      );
      if (typeof c.label !== "string")
        add("STORY_INVALID_NODE", "Port requires a label", n.id);
      if (!own(c, "condition"))
        add("STORY_INVALID_NODE", "Port condition is required", n.id);
      if (
        n.type === "decision" &&
        (typeof c.historicalAnnotation !== "string" ||
          typeof c.educationalExplanation !== "string" ||
          !Array.isArray(c.tags) ||
          c.tags.some((t) => typeof t !== "string") ||
          !own(c, "iconAssetId") ||
          (c.iconAssetId !== null && !UUID.test(c.iconAssetId)))
      )
        add(
          "STORY_INVALID_NODE",
          "Choice requires explanations, tags and a nullable icon UUID",
          n.id,
        );
      if (n.type === "decision") citations(c.sourceRefs, "Choice");
      identity(c.id, "port");
      try {
        validateCondition(c.condition, g.stateDefinitions);
        if (n.type === "decision")
          validateEffects(c.effects, g.stateDefinitions);
      } catch (e) {
        add(e.code, e.message, n.id);
      }
    }
  }
  for (const e of g.edges) {
    if (
      !keys(
        e,
        [
          "id",
          "sourceNodeId",
          "targetNodeId",
          "sourcePort",
          "label",
          "condition",
          "effects",
        ],
        "edge",
      )
    )
      continue;
    identity(e.id, "edge");
    if (
      !UUID.test(e.sourceNodeId) ||
      !UUID.test(e.targetNodeId) ||
      typeof e.sourcePort !== "string" ||
      !own(e, "condition") ||
      typeof e.label !== "string"
    )
      add("STORY_INVALID_EDGE", "Malformed edge");
    try {
      validateCondition(e.condition, g.stateDefinitions);
      validateEffects(e.effects, g.stateDefinitions);
    } catch (err) {
      add(err.code, err.message, e.sourceNodeId);
    }
  }
  const state = validateState(g.initialState, g.stateDefinitions);
  errors.push(...state.errors);
  if (!g.nodes.some((n) => n?.id === g.entryNodeId))
    add("STORY_INVALID_ENTRY", "Entry node does not exist");
  return { ok: !errors.length, errors };
}
function validateGraphV2(g) {
  const errors = [];
  const add = (message, nodeId) =>
    errors.push({ code: "STORY_INVALID_GRAPH", message, nodeId });
  const languages = g.languages;
  const canonical = (s) => {
    try {
      return typeof s === "string" && Intl.getCanonicalLocales(s)[0] === s;
    } catch {
      return false;
    }
  };
  if (g.engineVersion !== "2.0.0") add("Unsupported version 2 runtime");
  if (
    !Array.isArray(languages) ||
    !languages.length ||
    languages.some((s) => !canonical(s)) ||
    new Set(languages).size !== languages.length ||
    !languages.includes(g.defaultLanguage)
  )
    add(
      "Languages must be unique canonical BCP 47 tags and include the default language",
    );
  const localized = (v) =>
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(v).every(
      ([k, t]) => languages?.includes(k) && typeof t === "string",
    );
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges))
    return {
      ok: false,
      errors: [
        {
          code: "STORY_INVALID_GRAPH",
          message: "Nodes and edges are required",
        },
      ],
    };
  const starts = g.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1 || starts[0].id !== g.entryNodeId)
    add("Exactly one START must be the entry node");
  if (starts.some((n) => n.condition !== null || n.enterEffects?.length))
    add(
      "START uses graph initial state; it cannot have conditions or entry effects",
    );
  const lineIds = new Set();
  for (const n of g.nodes) {
    if (!localized(n.title))
      add("Node title must contain localized text", n.id);
    for (const key of [
      "prompt",
      "explanation",
      "historicalExplanation",
      "educationalSummary",
    ])
      if (n[key] !== undefined && !localized(n[key]))
        add(`${key} requires localized text`, n.id);
    for (const item of n.cases ?? [])
      if (!localized(item.label))
        add("Case label requires localized text", n.id);
    if (n.type === "scene") {
      if (!UUID.test(n.sceneId)) add("Scene UUID is required", n.id);
      const c = n.content;
      if (
        !c ||
        Object.keys(c).some(
          (k) =>
            ![
              "synopsis",
              "visualPrompt",
              "decisionPrompt",
              "transitionMode",
              "dialogue",
            ].includes(k),
        ) ||
        !localized(c.synopsis) ||
        !localized(c.visualPrompt) ||
        !localized(c.decisionPrompt) ||
        !["continue", "choice"].includes(c.transitionMode) ||
        !Array.isArray(c.dialogue)
      ) {
        add(
          "Scene requires localized content, dialogue and transition mode",
          n.id,
        );
        continue;
      }
      for (const line of c.dialogue) {
        if (
          !line ||
          Object.keys(line).some(
            (k) =>
              ![
                "id",
                "speakerId",
                "text",
                "delivery",
                "emotion",
                "intensity",
                "pace",
                "offscreen",
              ].includes(k),
          ) ||
          !UUID.test(line.id) ||
          lineIds.has(line.id) ||
          !(line.speakerId === null || UUID.test(line.speakerId)) ||
          !localized(line.text) ||
          !localized(line.delivery) ||
          typeof line.emotion !== "string" ||
          !Number.isFinite(line.intensity) ||
          line.intensity < 0 ||
          line.intensity > 1 ||
          !Number.isFinite(line.pace) ||
          line.pace <= 0 ||
          typeof line.offscreen !== "boolean"
        )
          add("Malformed scene dialogue", n.id);
        lineIds.add(line?.id);
      }
      if (
        !Array.isArray(n.choices) ||
        (c.transitionMode === "continue" && n.choices.length)
      )
        add("Continue scenes cannot retain choices", n.id);
    }
    for (const choice of n.choices ?? [])
      for (const key of [
        "label",
        "historicalAnnotation",
        "educationalExplanation",
      ])
        if (!localized(choice[key]))
          add(`Choice ${key} requires localized text`, n.id);
  }
  // Reuse the strict version 1 validators for state, effects, citations and IDs.
  const projected = structuredClone(g);
  delete projected.languages;
  projected.schemaVersion = 1;
  projected.engineVersion = ENGINE_VERSION;
  projected.nodes = projected.nodes.map((n) => {
    n.title = resolveText(n.title, g.defaultLanguage, g.defaultLanguage);
    for (const key of [
      "prompt",
      "explanation",
      "historicalExplanation",
      "educationalSummary",
    ])
      if (n[key] !== undefined)
        n[key] = resolveText(n[key], g.defaultLanguage, g.defaultLanguage);
    for (const item of n.cases ?? [])
      item.label = resolveText(
        item.label,
        g.defaultLanguage,
        g.defaultLanguage,
      );
    if (n.type === "start") {
      n.type = "scene";
      n.sceneId = n.id;
    }
    if (n.type === "scene" && n.content?.transitionMode === "choice") {
      n.type = "decision";
      n.prompt = resolveText(
        n.content.decisionPrompt,
        g.defaultLanguage,
        g.defaultLanguage,
      );
      delete n.sceneId;
      delete n.presentation;
    } else if (n.type === "scene") delete n.choices;
    delete n.content;
    for (const c of n.choices ?? [])
      for (const key of [
        "label",
        "historicalAnnotation",
        "educationalExplanation",
      ])
        c[key] = resolveText(c[key], g.defaultLanguage, g.defaultLanguage);
    return n;
  });
  errors.push(...validateGraph(projected).errors);
  const ports = new Set();
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  for (const e of g.edges) {
    const source = nodes.get(e.sourceNodeId),
      target = nodes.get(e.targetNodeId);
    const key = `${e.sourceNodeId}:${e.sourcePort}`;
    if (
      !source ||
      e.sourceNodeId === e.targetNodeId ||
      !target ||
      target.type === "start" ||
      source.type === "ending" ||
      ports.has(key)
    )
      add("Invalid, duplicate or dangling connection", e.sourceNodeId);
    const valid =
      source?.type === "decision" ||
      source?.content?.transitionMode === "choice"
        ? source.choices?.some((c) => c.id === e.sourcePort)
        : source?.type === "conditional"
          ? e.sourcePort === "fallback" ||
            source.cases?.some((c) => c.id === e.sourcePort)
          : e.sourcePort === "next";
    if (!valid) add("Invalid source port", e.sourceNodeId);
    ports.add(key);
  }
  return { ok: errors.length === 0, errors };
}
function mustEffects(state, effects, definitions) {
  const r = applyEffects(state, effects, definitions);
  if (!r.ok) throw new StoryError("STORY_INVALID_EFFECT", r.errors[0].message);
  return r.state;
}
function mustCondition(c, state, defs) {
  const r = evaluateCondition(c, state, defs);
  if (!r.ok)
    throw new StoryError(
      "STORY_BLOCKED_TRANSITION",
      r.reasons[0].message,
      r.reasons,
    );
}
export function startSession(graph, definitions, initialState) {
  const { id, revision, document: g } = envelope(graph);
  const check = validateGraph(graph);
  if (!check.ok)
    throw new StoryError(
      "STORY_INVALID_GRAPH",
      check.errors[0].message,
      check.errors,
    );
  const defs = definitions ?? g.stateDefinitions;
  let state = clone(initialState ?? g.initialState);
  const stateCheck = validateState(state, defs);
  if (!stateCheck.ok)
    throw new StoryError(
      "STORY_INVALID_STATE",
      stateCheck.errors[0].message,
      stateCheck.errors,
    );
  const node = g.nodes.find((n) => n.id === g.entryNodeId);
  mustCondition(node.condition, state, defs);
  state = mustEffects(state, node.enterEffects, defs);
  return {
    graphId: id,
    graphRevision: revision,
    currentNodeId: node.id,
    state,
    edgeHistory: [],
    visitedNodes: [node.id],
    ended: node.type === "ending",
    outcome: node.type === "ending" ? clone(node.outcomes) : null,
  };
}
export function stepSession(graph, session, edgeId) {
  const { id, revision, document: g } = envelope(graph);
  if (session.graphId !== id || session.graphRevision !== revision)
    fail("STORY_REVISION_CONFLICT", "The graph changed; replay this path");
  if (session.ended)
    fail("STORY_ENDED", "This ending has already been reached");
  if (session.edgeHistory.length >= 10000)
    fail("STORY_LIMIT", "Traversal limit exceeded");
  const node = g.nodes.find((n) => n.id === session.currentNodeId);
  const edge = g.edges.find(
    (e) => e.id === edgeId && e.sourceNodeId === node.id,
  );
  if (!edge)
    fail("STORY_INVALID_EDGE", "This edge does not leave the current node");
  const defs = g.stateDefinitions;
  let state = clone(session.state);
  if (node.type === "decision" || node.content?.transitionMode === "choice") {
    const choice = node.choices.find((c) => c.id === edge.sourcePort);
    if (!choice)
      fail("STORY_INVALID_EDGE", "Edge does not correspond to a choice");
    mustCondition(choice.condition, state, defs);
    mustCondition(edge.condition, state, defs);
    state = mustEffects(state, choice.effects, defs);
  } else if (node.type === "conditional") {
    const matches = node.cases.filter(
      (c) => evaluateCondition(c.condition, state, defs).ok,
    );
    if (matches.length > 1)
      fail(
        "STORY_AMBIGUOUS_CONDITIONAL",
        "More than one conditional case matches",
      );
    if (edge.sourcePort !== (matches[0]?.id ?? "fallback"))
      fail("STORY_BLOCKED_TRANSITION", "This conditional case does not match");
  } else if (edge.sourcePort !== "next")
    fail("STORY_INVALID_EDGE", "This node requires its next port");
  mustCondition(edge.condition, session.state, defs);
  state = mustEffects(state, edge.effects, defs);
  const target = g.nodes.find((n) => n.id === edge.targetNodeId);
  if (!target) fail("STORY_INVALID_EDGE", "Target node is missing");
  mustCondition(target.condition, state, defs);
  state = mustEffects(state, target.enterEffects, defs);
  const before = session.state.world?.historicalTime,
    after = state.world?.historicalTime;
  if (before && after && after < before)
    fail("STORY_HISTORICAL_CONFLICT", "Historical time cannot move backward");
  return {
    ...session,
    currentNodeId: target.id,
    state,
    edgeHistory: [...session.edgeHistory, edge.id],
    visitedNodes: [...session.visitedNodes, target.id],
    ended: target.type === "ending",
    outcome: target.type === "ending" ? clone(target.outcomes) : null,
  };
}
export function listChoices(graph, session) {
  const { document: g } = envelope(graph);
  const node = g.nodes.find((n) => n.id === session.currentNodeId);
  const available = [],
    blocked = [];
  const ports =
    node?.type === "decision" || node?.content?.transitionMode === "choice"
      ? node.choices
      : g.edges
          .filter((e) => e.sourceNodeId === node?.id)
          .map((e) => ({ id: e.sourcePort, label: e.label || "Continue" }));
  for (const c of ports ?? []) {
    const edge = g.edges.find(
      (e) => e.sourceNodeId === node.id && e.sourcePort === c.id,
    );
    try {
      if (!edge) fail("STORY_INVALID_EDGE", "Connect this choice first");
      stepSession(graph, session, edge.id);
      available.push({ ...c, edgeId: edge.id });
    } catch (e) {
      blocked.push({
        ...c,
        edgeId: edge?.id,
        reasons: [{ code: e.code, message: e.message }],
      });
    }
  }
  return { available, blocked };
}
export function replaySession(graph, definitions, initialState, edgeIds = []) {
  let session = startSession(graph, definitions, initialState);
  for (const id of edgeIds) session = stepSession(graph, session, id);
  return session;
}
