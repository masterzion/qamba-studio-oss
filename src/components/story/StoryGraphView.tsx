import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import { Play, Clapperboard, Flag } from "lucide-react";
import "@xyflow/react/dist/style.css";
import "../../styles/storyGraph.css";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "../../hooks/useLiveQuery";
import {
  createGraph,
  loadGraphs,
  saveGraph,
  storyStore,
} from "../../lib/db/storyGraphs";
import { validateStory } from "../../lib/storyValidation";
import { analyzeStory } from "../../lib/storyAnalysis";
import { initialStateFromDefinitions } from "../../../director/story_runtime.js";
import { useStoryGraphStore } from "../../stores/useStoryGraphStore";
import type {
  StoryGraph,
  GraphDocument,
  StoryNode,
} from "../../lib/storyTypes";
import StoryNodeCard from "./StoryNodeCard";
import StoryInspector from "./StoryInspector";
import StorySimulator from "./StorySimulator";
import StateDefinitionsEditor from "./StateDefinitionsEditor";
import HistoricalBiblePanel from "./HistoricalBiblePanel";
import CanonicalAssetsPanel from "./CanonicalAssetsPanel";
import LocalProviderProfiles from "./LocalProviderProfiles";
import StoryExportPanel from "./StoryExportPanel";
import { saveGraphInStore } from "../../lib/storyPersistence";
import StoryAnalysisPanel from "./StoryAnalysisPanel";
import StoryProposalPanel from "./StoryProposalPanel";
import {
  appendStoryScene,
  emptySceneContent,
  migrateStoryDocument,
} from "../../lib/storyAuthoring";
import { openStorySceneEditor } from "../../lib/storyEditorBridge";
import StoryTimelinePicker from "./StoryTimelinePicker";
import StoryLanguagePicker from "./StoryLanguagePicker";
import { editLocalizedText } from "../../lib/storyLocalization";
import { localSaveStatus, saveNow } from "../../lib/localPlane";
import { isDesktop } from "../../lib/desktop";
const nodeTypes = { story: StoryNodeCard };
export default function StoryGraphView({
  projectId,
  selectedGraphId,
  onSelectGraph,
}: {
  projectId: string;
  selectedGraphId?: string;
  onSelectGraph?: (id: string) => void;
}) {
  const { gid: routeGid } = useParams(),
    nav = useNavigate(),
    ui = useStoryGraphStore();
  const gid = selectedGraphId ?? routeGid;
  const [params] = useSearchParams();
  const [saveStatus, setSaveStatus] = useState(localSaveStatus(projectId));
  useEffect(() => {
    const changed = () => setSaveStatus(localSaveStatus(projectId));
    window.addEventListener("qamba-local-save-state", changed);
    return () => window.removeEventListener("qamba-local-save-state", changed);
  }, [projectId]);
  const [creating, setCreating] = useState(params.get("create") === "1"),
    [newTitle, setNewTitle] = useState("Untitled story"),
    [newLanguage, setNewLanguage] = useState("lv"),
    [additionalLanguages, setAdditionalLanguages] = useState("");
  const selectGraph = (id: string) =>
    onSelectGraph
      ? onSelectGraph(id)
      : nav(`/project/${projectId}/story/${id}`);
  const { data: graphs, reload } = useLiveQuery(
    () => loadGraphs(projectId),
    ["story_graphs"],
    [projectId],
  );
  const [graph, setGraph] = useState<StoryGraph | null>(null),
    [canvas, setCanvas] = useState<Node[]>([]),
    [error, setError] = useState(""),
    [tab, setTab] = useState("graph");
  const [language, setLanguage] = useState("lv");
  const revealNode = useRef<((id: string) => void) | null>(null);
  const editorRequest = useRef(0);
  const openNode = async (nodeId: string, openFullTimeline = false) => {
    ui.select(nodeId);
    const request = ++editorRequest.current,
      latest = current.current;
    if (
      !latest ||
      latest.document.nodes.find((n) => n.id === nodeId)?.type !== "scene"
    ) {
      return;
    }
    try {
      const context = await openStorySceneEditor({
        projectId,
        graphId: latest.id,
        expectedGraphRevision: latest.revision,
        nodeId,
        language,
      });
      if (request === editorRequest.current) {
        if (openFullTimeline) nav(context.href);
      }
    } catch (e: any) {
      if (request === editorRequest.current) setError(e.message);
    }
  };
  const current = useRef<StoryGraph | null>(null),
    loaded = useRef("");
  useEffect(() => {
    const g = graphs?.find((g) => g.id === gid) ?? (!gid ? graphs?.[0] : null);
    if (
      g &&
      (loaded.current !== g.id || g.revision > (current.current?.revision ?? 0))
    ) {
      const switching = loaded.current !== g.id;
      loaded.current = g.id;
      current.current = g;
      setGraph(g);
      if (switching) {
        setLanguage(
          g.document.languages?.includes(params.get("lang") ?? "")
            ? params.get("lang")!
            : g.document.defaultLanguage,
        );
        ui.reset();
        ++editorRequest.current;
      }
      setCanvas(
        g.document.nodes.map((n) => ({
          id: n.id,
          type: "story",
          position: g.document.editor.positions[n.id] ?? { x: 0, y: 0 },
          data: { storyNode: n, issues: [] },
        })),
      );
    }
    if (!g && graphs) {
      setGraph(null);
      current.current = null;
      loaded.current = "";
    }
  }, [graphs, gid, projectId]);
  const update = useCallback(
    (document: GraphDocument, reason = "Edit graph", record = true) => {
      if (!current.current) return;
      const previous = structuredClone(current.current);
      try {
        const saved = saveGraphInStore(storyStore(projectId), {
          graph_id: previous.id,
          expected_revision: previous.revision,
          document,
          reason,
          title: previous.title,
        });
        if (record) useStoryGraphStore.getState().record(previous.document);
        current.current = saved;
        setGraph(current.current);
        setCanvas(
          document.nodes.map((n) => ({
            id: n.id,
            type: "story",
            position: document.editor.positions[n.id] ?? { x: 0, y: 0 },
            data: { storyNode: n, issues: [] },
          })),
        );
        setError("");
      } catch (e: any) {
        setError(e.message);
        loaded.current = "";
        reload();
      }
    },
    [reload, projectId],
  );
  const diagnostics = graph ? validateStory(graph.document) : [];
  const nodes = canvas.map((n) => ({
    ...n,
    selected: n.id === ui.selectedId,
    data: {
      ...n.data,
      storyNode: graph?.document.nodes.find((v) => v.id === n.id),
      language,
      defaultLanguage: graph?.document.defaultLanguage,
      issues: diagnostics.filter((d) => d.nodeId === n.id),
      mediaStatus:
        storyStore(projectId)
          .rows("production_units")
          .filter((u) => u.node_id === n.id)
          .map((u) => u.status)
          .join(", ") || "Media not produced",
      onOpenVideoEditor: () => {
        void openNode(n.id, true);
      },
    },
  }));
  const edges: Edge[] =
    graph?.document.edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.sourcePort,
      label: e.label,
      selected: e.id === ui.selectedId,
    })) ?? [];
  const connect = (c: Connection) => {
    if (!graph || !c.source || !c.target || !c.sourceHandle) return;
    if (c.source === c.target) {
      setError("A node cannot connect to itself.");
      return;
    }
    if (graph.document.nodes.find((n) => n.id === c.target)?.type === "start") {
      setError("START cannot have incoming connections.");
      return;
    }
    if (
      graph.document.edges.some(
        (e) => e.sourceNodeId === c.source && e.sourcePort === c.sourceHandle,
      ) &&
      !window.confirm("Replace the existing connection from this port?")
    )
      return;
    update(
      {
        ...graph.document,
        edges: [
          ...graph.document.edges.filter(
            (e) =>
              !(e.sourceNodeId === c.source && e.sourcePort === c.sourceHandle),
          ),
          {
            ...(graph.document.edges.find(
              (e) =>
                e.sourceNodeId === c.source && e.sourcePort === c.sourceHandle,
            ) ?? {
              id: crypto.randomUUID(),
              label: "",
              condition: null,
              effects: [],
            }),
            sourceNodeId: c.source,
            targetNodeId: c.target,
            sourcePort: c.sourceHandle,
          },
        ],
      },
      "Connect nodes",
    );
  };
  const add = (type: StoryNode["type"], binding?: string) => {
    if (!graph) return;
    if (type === "start") {
      const existing = graph.document.nodes.find((node) => node.type === "start");
      if (existing) {
        ui.select(existing.id);
        revealNode.current?.(existing.id);
        return;
      }
    }
    const id = crypto.randomUUID(),
      n: StoryNode = {
        id,
        type,
        title:
          graph.document.schemaVersion === 2
            ? {
                [graph.document.defaultLanguage]:
                  `New ${type.replace("_", " ")}`,
              }
            : `New ${type.replace("_", " ")}`,
        condition: null,
        enterEffects: [],
        sourceRefs: [],
        tags: [],
      };
    if (type === "scene") {
      if (!binding) return;
      n.sceneId = binding;
      if (graph.document.schemaVersion === 2) {
        n.content = emptySceneContent();
        n.choices = [];
      }
    }
    if (type === "historical_event") {
      if (!binding) return;
      n.historicalEntryId = binding;
      n.explanation = editLocalizedText(
        undefined,
        language,
        "",
        graph.document.schemaVersion,
      );
    }
    if (type === "decision") {
      n.prompt = editLocalizedText(
        undefined,
        language,
        "Choose an action",
        graph.document.schemaVersion,
      );
      n.choices = [];
    }
    if (type === "conditional") n.cases = [];
    if (type === "ending") {
      n.classification = "mixed";
      n.outcomes = {};
      n.historicalExplanation = editLocalizedText(
        undefined,
        language,
        "",
        graph.document.schemaVersion,
      );
      n.educationalSummary = editLocalizedText(
        undefined,
        language,
        "",
        graph.document.schemaVersion,
      );
    }
    update(
      {
        ...graph.document,
        entryNodeId: type === "start" ? id : graph.document.entryNodeId,
        nodes: [...graph.document.nodes, n],
        edges: type === "start" ? [...graph.document.edges, {
          id: crypto.randomUUID(), sourceNodeId: id,
          targetNodeId: graph.document.entryNodeId, sourcePort: "next",
          label: "", condition: null, effects: [],
        }] : graph.document.edges,
        editor: {
          ...graph.document.editor,
          positions: {
            ...graph.document.editor.positions,
            [id]: { x: 100 + canvas.length * 35, y: 120 },
          },
        },
      },
      "Create node",
    );
    ui.select(id);
  };
  const undo = () => {
    const s = useStoryGraphStore.getState(),
      doc = s.past.at(-1);
    if (!doc || !graph) return;
    useStoryGraphStore.setState({
      past: s.past.slice(0, -1),
      future: [graph.document, ...s.future],
    });
    update(doc, "Undo graph edit", false);
  };
  const redo = () => {
    const s = useStoryGraphStore.getState(),
      doc = s.future[0];
    if (!doc || !graph) return;
    useStoryGraphStore.setState({
      past: [...s.past, graph.document],
      future: s.future.slice(1),
    });
    update(doc, "Redo graph edit", false);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [graph]);
  return (
    <div className="story-view">
      <header className="story-toolbar">
        <select
          aria-label="Story graph"
          value={graph?.id ?? ""}
          onChange={(e) => selectGraph(e.target.value)}
        >
          <option value="">Select story</option>
          {graphs?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <button onClick={() => setCreating(true)}>New story</button>
        {graph && (
          <>
            <button onClick={() => setTab("graph")}>Story Graph</button>
            <button onClick={() => setTab("simulate")}>Simulate</button>
            <button onClick={() => setTab("state")}>State</button>
            <button onClick={() => setTab("history")}>Historical Bible</button>
            <button onClick={() => setTab("canonical")}>
              Canonical assets
            </button>
            <button onClick={() => setTab("providers")}>Local providers</button>
            <button onClick={() => setTab("export")}>Export</button>
            <button onClick={() => setTab("proposals")}>
              Director proposals
            </button>
            <button onClick={() => setTab("analysis")}>
              Validate & analyze
            </button>
            <button disabled={!ui.past.length} onClick={undo}>
              Undo
            </button>
            <button disabled={!ui.future.length} onClick={redo}>
              Redo
            </button>
            <span>Revision {graph.revision}</span>
            <span role="status">
              {isDesktop() ? saveStatus : "Browser preview · not saved to disk"}
            </span>
            <button
              onClick={async () => {
                try {
                  await saveNow(projectId, true);
                  setError("");
                } catch (e: any) {
                  setError(`Save failed: ${e.message}`);
                }
              }}
            >
              Save project
            </button>
          </>
        )}
      </header>
      {creating && (
        <section className="story-panel" aria-label="Create branching story">
          <h3>Create branching story</h3>
          <label>
            Story title
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <StoryLanguagePicker
            label="Default story language"
            value={newLanguage}
            onChange={setNewLanguage}
          />
          <label>
            Additional languages
            <input
              value={additionalLanguages}
              onChange={(e) => setAdditionalLanguages(e.target.value)}
              placeholder="en, de-DE (optional)"
            />
          </label>
          <button
            onClick={async () => {
              try {
                const g = await createGraph(
                  projectId,
                  newTitle.trim() || "Untitled story",
                  undefined,
                  newLanguage,
                  additionalLanguages
                    .split(",")
                    .map((l) => l.trim())
                    .filter(Boolean),
                );
                selectGraph(g.id);
                reload();
                setCreating(false);
                setError("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Create story
          </button>
          <button onClick={() => setCreating(false)}>Cancel</button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {!graph ? (
        <p>
          Create a story graph. Existing scenes and timeline remain your
          media-production tools.
        </p>
      ) : tab === "simulate" ? (
        <StorySimulator graph={graph} language={language} />
      ) : tab === "history" ? (
        <HistoricalBiblePanel projectId={projectId} />
      ) : tab === "canonical" ? (
        <CanonicalAssetsPanel projectId={projectId} />
      ) : tab === "providers" ? (
        <LocalProviderProfiles />
      ) : tab === "export" ? (
        <StoryExportPanel graph={graph} />
      ) : tab === "proposals" ? (
        <StoryProposalPanel
          projectId={projectId}
          onApplied={() => {
            loaded.current = "";
            reload();
          }}
        />
      ) : tab === "state" ? (
        <StateDefinitionsEditor
          value={graph.document.stateDefinitions}
          onChange={(stateDefinitions) => {
            try {
              update({
                ...graph.document,
                stateDefinitions,
                initialState: initialStateFromDefinitions(stateDefinitions),
              });
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
      ) : tab === "analysis" ? (
        <StoryAnalysisPanel graph={graph} />
      ) : (
        <>
          <div className="story-toolbar">
            {graph.document.schemaVersion === 1 ? (
              <button
                onClick={() =>
                  update(
                    migrateStoryDocument(graph.document, storyStore(projectId)),
                    "Upgrade story to version 2",
                  )
                }
              >
                Upgrade to START / SCENE / END
              </button>
            ) : (
              <>
                <button onClick={() => add("start")}
                  title={graph.document.nodes.some((node) => node.type === "start")
                    ? "This story already has its one START node. Click to select and reveal it."
                    : "Add the story's starting point"}>
                  <Play size={16} aria-hidden="true" /> Add START
                </button>
                <button
                  onClick={() => {
                    try {
                      const saved = appendStoryScene(
                        storyStore(projectId),
                        graph,
                      );
                      ui.record(graph.document);
                      current.current = saved;
                      setGraph(saved);
                      setCanvas(
                        saved.document.nodes.map((n) => ({
                          id: n.id,
                          type: "story",
                          position: saved.document.editor.positions[n.id] ?? {
                            x: 0,
                            y: 0,
                          },
                          data: { storyNode: n, issues: [] },
                        })),
                      );
                      setError("");
                      ui.select(saved.document.nodes.at(-1)!.id);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  <Clapperboard size={16} aria-hidden="true" /> Add SCENE
                </button>
                <select
                  aria-label="Story language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {graph.document.languages?.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const input = window.prompt(
                      "Language tag, for example en, lv or de-DE",
                    );
                    if (!input) return;
                    try {
                      const locale = Intl.getCanonicalLocales(input.trim())[0];
                      if (!locale) throw new Error("Enter a language tag");
                      update(
                        {
                          ...graph.document,
                          schemaVersion: 2,
                          languages: [
                            ...new Set([
                              ...(graph.document.languages ?? []),
                              locale,
                            ]),
                          ],
                        },
                        "Add story language",
                      );
                      setLanguage(locale);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  Add language
                </button>
              </>
            )}
            <button onClick={() => add("ending")}><Flag size={16} aria-hidden="true" /> Add END</button>
            <details>
              <summary>Advanced nodes</summary>
              {(["decision", "conditional"] as const).map((type) => (
                <button key={type} onClick={() => add(type)}>
                  Add {type}
                </button>
              ))}
              <select
                aria-label="Add existing scene"
                value=""
                onChange={(e) => add("scene", e.target.value)}
              >
                <option value="">Add scene…</option>
                {storyStore(projectId)
                  .rows("scenes")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.slug || `Scene ${s.idx + 1}`}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Add historical event"
                value=""
                onChange={(e) => add("historical_event", e.target.value)}
              >
                <option value="">Add historical event…</option>
                {storyStore(projectId)
                  .rows("bible_entries")
                  .filter((e) => e.doc?.historical)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </details>
            <span>{diagnostics.length} validation issues</span>
          </div>
          <div className="story-workspace">
            <div className="story-canvas">
              <ReactFlow
                onInit={(instance) => { revealNode.current = (id) => {
                  void instance.fitView({ nodes: [{ id }], padding: 0.7, maxZoom: 1.2, duration: 250 });
                }; }}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onBeforeDelete={async ({ nodes: deleted }) => {
                  if (
                    deleted.some(
                      (n) =>
                        graph.document.nodes.find((v) => v.id === n.id)
                          ?.type === "start",
                    )
                  ) {
                    setError("START cannot be deleted.");
                    return false;
                  }
                  return true;
                }}
                onNodesChange={(changes) =>
                  setCanvas((v) => applyNodeChanges(changes, v))
                }
                onConnect={connect}
                onNodeClick={(event, n) => {
                  if (
                    (event.target as HTMLElement).closest(
                      "button,input,textarea,select,.react-flow__handle",
                    )
                  )
                    return;
                  ++editorRequest.current;
                  ui.select(n.id);
                }}
                onEdgeClick={(_, e) => ui.select(e.id)}
                onNodeDoubleClick={(event, n) => {
                  if ((event.target as HTMLElement).closest(
                    "button,input,textarea,select,.react-flow__handle",
                  )) return;
                  if (graph.document.nodes.find((v) => v.id === n.id)?.type === "scene")
                    void openNode(n.id, true);
                }}
                onNodeDragStop={(_, n) =>
                  update(
                    {
                      ...graph.document,
                      editor: {
                        ...graph.document.editor,
                        positions: {
                          ...graph.document.editor.positions,
                          [n.id]: n.position,
                        },
                      },
                    },
                    "Move node",
                  )
                }
                onEdgesDelete={(deleted) =>
                  update({
                    ...graph.document,
                    edges: graph.document.edges.filter(
                      (e) => !deleted.some((d) => d.id === e.id),
                    ),
                  })
                }
                onNodesDelete={(deleted) => {
                  if (
                    deleted.some(
                      (n) =>
                        graph.document.nodes.find((v) => v.id === n.id)
                          ?.type === "start",
                    )
                  ) {
                    setError("START cannot be deleted.");
                    return;
                  }
                  const ids = new Set(deleted.map((n) => n.id));
                  update({
                    ...graph.document,
                    nodes: graph.document.nodes.filter((n) => !ids.has(n.id)),
                    edges: graph.document.edges.filter(
                      (e) =>
                        !ids.has(e.sourceNodeId) && !ids.has(e.targetNodeId),
                    ),
                    entryNodeId: ids.has(graph.document.entryNodeId)
                      ? (graph.document.nodes.find((n) => !ids.has(n.id))?.id ??
                        graph.document.entryNodeId)
                      : graph.document.entryNodeId,
                  });
                }}
                onMoveEnd={(_, viewport) => {
                  if (
                    JSON.stringify(viewport) !==
                    JSON.stringify(graph.document.editor.viewport)
                  )
                    update(
                      {
                        ...graph.document,
                        editor: { ...graph.document.editor, viewport },
                      },
                      "Move viewport",
                      false,
                    );
                }}
                defaultViewport={graph.document.editor.viewport}
              >
                <Background />
                <Controls />
                <MiniMap
                  style={{ background: "#202632" }}
                  maskColor="#090c1299"
                  nodeColor="#647088"
                />
              </ReactFlow>
            </div>
            <aside className="story-inspector">
              <StoryInspector
                language={language}
                projectId={projectId}
                document={graph.document}
                selectedId={ui.selectedId}
                onChange={update}
                timelinePicker={ui.selectedId ? <StoryTimelinePicker
                  key={`${graph.id}:${ui.selectedId}:${language}`}
                  projectId={projectId} graphId={graph.id} nodeId={ui.selectedId}
                  language={language} onOpen={() => { void openNode(ui.selectedId!, true); }}
                /> : undefined}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
