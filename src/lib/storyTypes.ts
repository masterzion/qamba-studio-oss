export type StateValue = number | string | boolean | null | string[];
export interface StateDefinition {
  type: "number" | "string" | "boolean" | "set";
  default?: StateValue;
  optional?: boolean;
  nullable?: boolean;
  min?: number;
  max?: number;
  values?: (string | number | boolean)[];
}
export interface StateDefinitions {
  paths: Record<string, StateDefinition>;
}
export type GameState = Record<string, any>;
export type Condition =
  | null
  | {
      path: string;
      operator:
        | "eq"
        | "neq"
        | "gt"
        | "gte"
        | "lt"
        | "lte"
        | "contains"
        | "notContains"
        | "exists"
        | "notExists";
      value?: StateValue;
    }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
export interface Effect {
  operation: "set" | "increment" | "decrement" | "add" | "remove";
  path: string;
  value: StateValue;
}
export interface CitationRef {
  sourceId: string;
  locator: string;
  excerpt: string | null;
  note: string;
}
export interface Choice {
  id: string;
  label: string | LocalizedText;
  iconAssetId: string | null;
  condition: Condition;
  effects: Effect[];
  historicalAnnotation: string | LocalizedText;
  educationalExplanation: string | LocalizedText;
  sourceRefs: CitationRef[];
  tags: string[];
}
export interface StoryNode {
  id: string;
  type:
    | "start"
    | "scene"
    | "decision"
    | "conditional"
    | "historical_event"
    | "ending";
  title: string | LocalizedText;
  content?: SceneContent;
  condition: Condition;
  enterEffects: Effect[];
  sourceRefs: CitationRef[];
  tags: string[];
  sceneId?: string;
  presentation?: {
    subtitleAssetId: string | null;
    posterAssetId: string | null;
  };
  prompt?: string | LocalizedText;
  choices?: Choice[];
  cases?: { id: string; label: string | LocalizedText; condition: Condition }[];
  historicalEntryId?: string;
  explanation?: string | LocalizedText;
  classification?: string;
  outcomes?: Record<string, number | string | boolean>;
  historicalExplanation?: string | LocalizedText;
  educationalSummary?: string | LocalizedText;
}
export interface StoryEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  label: string;
  condition: Condition;
  effects: Effect[];
}
interface GraphDocumentFields {
  engineVersion: string;
  entryNodeId: string;
  defaultLanguage: string;
  nodes: StoryNode[];
  edges: StoryEdge[];
  stateDefinitions: StateDefinitions;
  initialState: GameState;
  editor: {
    positions: Record<string, { x: number; y: number }>;
    viewport: { x: number; y: number; zoom: number };
  };
  metadata: Record<string, unknown>;
}
export type GraphDocumentV1 = GraphDocumentFields & {
  schemaVersion: 1;
  languages?: never;
};
export type GraphDocumentV2 = GraphDocumentFields & {
  schemaVersion: 2;
  languages: string[];
};
export type GraphDocument = GraphDocumentV1 | GraphDocumentV2;
export type LocalizedText = Record<string, string>;
export interface SceneContent {
  synopsis: LocalizedText;
  visualPrompt: LocalizedText;
  decisionPrompt: LocalizedText;
  transitionMode: "continue" | "choice";
  dialogue: {
    id: string;
    speakerId: string | null;
    text: LocalizedText;
    delivery: LocalizedText;
    emotion: string;
    intensity: number;
    pace: number;
    offscreen: boolean;
  }[];
}
export interface StoryGraph {
  id: string;
  project_id: string;
  title: string;
  schema_version: number;
  revision: number;
  status: "draft" | "reviewed";
  document: GraphDocument;
  created_at: string;
  updated_at: string;
}
export interface StorySession {
  graphId: string;
  graphRevision: number;
  currentNodeId: string;
  state: GameState;
  edgeHistory: string[];
  visitedNodes: string[];
  ended: boolean;
  outcome: Record<string, StateValue> | null;
}
export interface StoryDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  nodeId?: string;
  edgeId?: string;
  path?: string;
  fixHint?: string;
}
