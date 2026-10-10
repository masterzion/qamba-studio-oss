import React, { useEffect, useRef, useState } from "react";
import { Graph, NodeView, MiniMap, Selection, type Node as X6Node } from "@antv/x6";
import { register, getProvider } from "@antv/x6-react-shape";
import { Plus, Minus, Scan, Lock, Unlock } from "lucide-react";
import StoryNodeCard from "./StoryNodeCard";
import { storyPorts } from "../../lib/storyPorts";

export interface CanvasNode { id: string; type?: string; position: { x: number; y: number }; data: Record<string, any>; selected?: boolean }
export interface CanvasEdge { id: string; source: string; target: string; sourceHandle?: string; label?: string; selected?: boolean }
export interface CanvasConnection { source: string | null; target: string | null; sourceHandle: string | null }
type Viewport = { x: number; y: number; zoom: number };
type CanvasEvent = { target: EventTarget | null };
interface Props {
  graphId: string; nodes: CanvasNode[]; edges: CanvasEdge[]; defaultViewport?: Viewport;
  onInit: (api: { fitView: (options: { nodes: { id: string }[]; padding?: number; maxZoom?: number; duration?: number }) => void }) => void;
  onConnect: (connection: CanvasConnection) => void;
  onNodeClick: (event: CanvasEvent, node: CanvasNode) => void;
  onNodeDoubleClick: (event: CanvasEvent, node: CanvasNode) => void;
  onEdgeClick: (event: CanvasEvent, edge: CanvasEdge) => void;
  onNodeDragStop: (event: CanvasEvent, node: CanvasNode) => void;
  onBeforeDelete: (items: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => Promise<boolean>;
  onDeleteSelection?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onNodesDelete: (nodes: CanvasNode[]) => void;
  onEdgesDelete: (edges: CanvasEdge[]) => void;
  onMoveEnd: (event: null, viewport: Viewport) => void;
}

const Portal = getProvider();
const inputPort = "__qamba_input__";
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest("button,input,textarea,select,a,.nodrag,.nopan");

function Card({ node }: { node: X6Node }) {
  const layout = React.useCallback((width: number, height: number, ports: { id: string; y: number }[]) => {
    const size = node.getSize();
    if (size.width !== width || size.height !== height) node.resize(width, height);
    for (const port of ports) {
      if (node.hasPort(port.id) && node.getPort(port.id)?.args?.y !== port.y) node.portProp(port.id, "args", { x: width, y: port.y });
    }
    if (node.hasPort(inputPort)) node.portProp(inputPort, "args", { x: 0, y: height / 2 });
  }, [node]);
  const data = node.getData();
  return <StoryNodeCard id={node.id} position={node.position()} data={data} selected={data.selected} onLayout={layout} />;
}
register({ shape: "qamba-story", component: Card, effect: ["data"], width: 248, height: 100 });

// Overview rectangles share the model but never mount React cards or video players.
class OverviewNodeView extends NodeView {
  protected renderMarkup() { this.renderJSONMarkup([{ tagName: "rect", selector: "body", attrs: { fill: "#647088", rx: 3 } }]); }
  update() { const size = this.cell.getSize(); const body = this.selectors.body as Element; body.setAttribute("width", String(size.width)); body.setAttribute("height", String(size.height)); }
  protected renderPorts() {}
}

export default function StoryCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), container = useRef<HTMLDivElement>(null), overview = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph | null>(null), latest = useRef(props), syncing = useRef(false), locked = useRef(false);
  const [isLocked, setLocked] = useState(false);
  const dragging = useRef<string | null>(null);
  latest.current = props;

  useEffect(() => {
    const element = container.current!, viewport = host.current!;
    let disposed = false, moveTimer: ReturnType<typeof setTimeout> | undefined;
    const instance = new Graph({ container: element, width: viewport.clientWidth, height: viewport.clientHeight,
      async: false, grid: { visible: true, size: 20, type: "dot", args: { color: "#485062", thickness: 1 } },
      background: { color: "#14171e" }, scaling: { min: .1, max: 2 },
      panning: { enabled: true, eventTypes: ["leftMouseDown"] },
      mousewheel: { enabled: true, minScale: .1, maxScale: 2 },
      interacting: () => ({ nodeMovable: !locked.current, edgeMovable: false, edgeLabelMovable: false, arrowheadMovable: false, magnetConnectable: !locked.current }),
      connecting: { allowBlank: false, allowLoop: true, allowEdge: false, allowNode: false, allowPort: true,
        snap: { radius: 20 }, connector: "smooth", connectionPoint: "anchor",
        validateMagnet: ({ magnet }) => !locked.current && magnet.getAttribute("port-group") === "output",
        // Authoring rejects self-links with its existing error message; no temporary link is persisted.
        validateConnection: ({ sourceCell, targetCell, sourceMagnet, targetMagnet }) => !!sourceCell && !!targetCell && sourceMagnet?.getAttribute("port-group") === "output" && targetMagnet?.getAttribute("port-group") === "input",
        createEdge: () => instance.createEdge({ data: { pendingConnection: true }, attrs: { line: { stroke: "#aeb9cf", strokeWidth: 2, targetMarker: null } }, zIndex: -1 }),
      },
    });
    graph.current = instance;
    instance.use(new Selection({ enabled: true, multiple: true, rubberband: true, modifiers: "shift", movable: false }));
    instance.use(new MiniMap({ container: overview.current!, width: 180, height: 120, padding: 8, scalable: true,
      graphOptions: { createCellView: cell => cell.isNode() ? OverviewNodeView : undefined } }));
    const notifyMove = () => {
      if (syncing.current || disposed) return;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => { if (disposed) return; const { tx, ty } = instance.translate(); latest.current.onMoveEnd(null, { x: tx, y: ty, zoom: instance.zoom() }); }, 180);
    };
    instance.on("translate", notifyMove); instance.on("scale", notifyMove);
    const findNode = (id: string) => latest.current.nodes.find(node => node.id === id);
    instance.on("node:click", ({ e, node }) => { const item = findNode(node.id); if (item && !editable(e.target)) latest.current.onNodeClick(e, item); });
    instance.on("node:dblclick", ({ e, node }) => { const item = findNode(node.id); if (item && !editable(e.target)) latest.current.onNodeDoubleClick(e, item); });
    instance.on("edge:click", ({ e, edge }) => { const item = latest.current.edges.find(item => item.id === edge.id); if (item) latest.current.onEdgeClick(e, item); });
    instance.on("node:moving", ({ node }) => { dragging.current = node.id; });
    instance.on("node:moved", ({ e, node }) => { dragging.current = null; const item = findNode(node.id); if (item && !syncing.current) latest.current.onNodeDragStop(e, { ...item, position: node.position() }); });
    instance.on("edge:connected", ({ edge, isNew }) => {
      if (!isNew || syncing.current) return;
      const connection = { source: edge.getSourceCellId(), target: edge.getTargetCellId(), sourceHandle: edge.getSourcePortId() || null };
      instance.removeEdge(edge); // Only the existing authoring callback commits approved links.
      latest.current.onConnect(connection);
    });
    const initial = latest.current.defaultViewport || { x: 0, y: 0, zoom: 1 };
    syncing.current = true; instance.zoomTo(initial.zoom); instance.translate(initial.x, initial.y); syncing.current = false;
    latest.current.onInit({ fitView: ({ nodes, padding = 0.7, maxZoom = 1.2 }) => {
      const cells = nodes.map(item => instance.getCellById(item.id)).filter((cell): cell is X6Node => !!cell);
      if (cells.length) instance.zoomToFit({ contentArea: instance.getCellsBBox(cells), padding, maxScale: maxZoom });
    } });
    const resize = new ResizeObserver(() => instance.resize(viewport.clientWidth, viewport.clientHeight)); resize.observe(viewport);
    const stopControls = (event: Event) => { if (editable(event.target)) event.stopPropagation(); };
    element.addEventListener("mousedown", stopControls); element.addEventListener("touchstart", stopControls, { passive: true });
    return () => {
      disposed = true; clearTimeout(moveTimer); resize.disconnect();
      element.removeEventListener("mousedown", stopControls); element.removeEventListener("touchstart", stopControls);
      instance.dispose(); graph.current = null;
    };
  }, [props.graphId]);

  useEffect(() => {
    const instance = graph.current; if (!instance) return;
    syncing.current = true;
    try {
      const ids = new Set([...props.nodes, ...props.edges].map(cell => cell.id));
      instance.getCells().filter(cell => !ids.has(cell.id) && !cell.getData()?.pendingConnection).forEach(cell => instance.removeCell(cell));
      for (const item of props.nodes) {
        let cell = instance.getCellById(item.id) as X6Node | null;
        if (!cell) cell = instance.addNode({ id: item.id, shape: "qamba-story", ...item.position, width: 248, height: 100 });
        if (dragging.current !== item.id && (cell.position().x !== item.position.x || cell.position().y !== item.position.y)) cell.position(item.position.x, item.position.y);
        const ports = storyPorts(item.data.storyNode);
        const portIds = new Set(ports.map(port => port.id));
        if (item.data.storyNode.type !== "start") portIds.add(inputPort);
        for (const port of cell.getPorts()) if (!portIds.has(port.id!)) cell.removePort(port.id!);
        cell.prop("ports/groups", { input: { position: "absolute", attrs: { circle: { r: 4, magnet: "passive", stroke: "#647088", fill: "#eee", "aria-label": "Incoming connection" } } }, output: { position: "absolute", attrs: { circle: { r: 4, magnet: true, stroke: "#647088", fill: "#eee" } } } });
        const size = cell.getSize();
        for (const [index, portId] of [...portIds].entries()) {
          if (!cell.hasPort(portId)) cell.addPort({ id: portId, group: portId === inputPort ? "input" : "output", args: { x: portId === inputPort ? 0 : size.width, y: portId === inputPort ? size.height / 2 : 65 + index * 28 } });
        }

        cell.setData({ ...item.data, selected: !!item.selected });
        const view = instance.findViewByCell(cell); view?.container.classList.toggle("selected", !!item.selected);
      }
      for (const item of props.edges) {
        let edge = instance.getCellById(item.id);
        if (!edge) edge = instance.addEdge({ id: item.id, source: { cell: item.source, port: item.sourceHandle }, target: { cell: item.target, port: inputPort }, connector: "smooth", zIndex: -1 });
        if (!edge.isEdge()) continue;
        edge.setSource({ cell: item.source, port: item.sourceHandle }); edge.setTarget({ cell: item.target, port: inputPort });
        edge.setLabels(item.label ? [{ attrs: { label: { text: item.label, fill: "#c1c9d9" }, body: { fill: "#14171e" } } }] : []);
        edge.attr("line", { stroke: item.selected ? "#c1d5ff" : "#647088", strokeWidth: item.selected ? 3 : 1.5, targetMarker: null });
      }
    } finally { syncing.current = false; }
  }, [props.nodes, props.edges, props.graphId]);

  const deleteSelection = async (event: React.KeyboardEvent) => {
    if (!["Delete", "Backspace"].includes(event.key) || editable(event.target) || locked.current) return;
    const selection = graph.current?.getPlugin("selection") as Selection | undefined;
    const selected = selection?.getSelectedCells() ?? [];
    const selectedIds = new Set(selected.map(cell => cell.id));
    const nodes = latest.current.nodes.filter(node => selectedIds.has(node.id) || node.selected);
    const edges = latest.current.edges.filter(edge => selectedIds.has(edge.id) || edge.selected);
    if (!nodes.length && !edges.length) return;
    event.preventDefault();
    if (!await latest.current.onBeforeDelete({ nodes, edges })) return;
    if (latest.current.onDeleteSelection) latest.current.onDeleteSelection(nodes, edges);
    else if (nodes.length) latest.current.onNodesDelete(nodes); else latest.current.onEdgesDelete(edges);
  };
  return <div className="story-x6-canvas" ref={host} tabIndex={0} onKeyDown={event => void deleteSelection(event)} onMouseDown={event => { if (!editable(event.target)) host.current?.focus({ preventScroll: true }); }}>
    <Portal /><div className="story-x6-surface" ref={container} />
    <div className="story-canvas-controls" aria-label="Graph controls">
      <button aria-label="Zoom in" onClick={() => graph.current?.zoom(.2)}><Plus size={16} /></button>
      <button aria-label="Zoom out" onClick={() => graph.current?.zoom(-.2)}><Minus size={16} /></button>
      <button aria-label="Fit view" onClick={() => graph.current?.zoomToFit({ padding: 40, maxScale: 1.2 })}><Scan size={16} /></button>
      <button aria-label="Toggle interactivity" aria-pressed={!isLocked} onClick={() => { locked.current = !locked.current; setLocked(locked.current); }}>{isLocked ? <Lock size={16} /> : <Unlock size={16} />}</button>
    </div><div className="story-canvas-minimap" ref={overview} aria-label="Story graph minimap" />
  </div>;
}
