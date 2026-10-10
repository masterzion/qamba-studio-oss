# AntV X6 graph canvas

The authoring canvas uses @antv/x6 3.1.8 and @antv/x6-react-shape 3.0.1, compatible with React 18. tslib is explicit because X6 imports its runtime helpers.

StoryCanvas translates the existing authoring nodes, edges, positions and viewport into X6 models. StoryGraphView keeps the existing validation, revision-safe saves, replacement confirmation, node deletion protections and undo/redo. The story JSON/schema, database, timeline integration, simulation and export formats do not change.

StoryNodeCard remains a React card, with native SVG input/output ports managed by the adapter. ResizeObserver keeps card bounds and port row coordinates aligned after translations, media previews and choice edits. In-progress edges remain temporary during document synchronization; only the authoring connection handler commits them. Node positions are not reset during an active drag.

Controls provide zoom, fit view and interaction locking. The minimap shares the graph model but renders simple rectangles instead of React/video nodes. Canvas instances, observers, event listeners and pending viewport timers are disposed when switching graphs or tabs.

Run `npm run test:story-canvas` and `npm run test:story-ui` against the isolated development fixture at the URL configured by BASE (default localhost:5177). These exercise browser rendering with the existing Tauri mock; they do not prove native IPC or a packaged WebView run. Typecheck with `npx tsc --noEmit` and build with `npm run build`.

MIT attribution is retained in [licenses/antv-x6-MIT.txt](licenses/antv-x6-MIT.txt) and [licenses/antv-x6-react-shape-MIT.txt](licenses/antv-x6-react-shape-MIT.txt).
