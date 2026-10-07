Interactive story package

Serve this folder through a local HTTP server and open player.html. Browsers
restrict module imports and fetch when opened directly as file:// URLs.

An authoring package has playable:false and contains draft narrative data.
A playable package contains reviewed media, decisions, localized dialogue,
subtitle files and the deterministic runtime. It needs no Qamba installation.

Game-engine integration: import graph.json, scenes.json and dialogue.json.
Use runtime/story-runtime.mjs for state transitions or port it against the
runtime/conformance.json fixtures. Decisions identify edges by stable UUID.
Each scene variant has its nodeId, unitId/presentationId, language, declarative
state condition, mediaPath and subtitles. Complete the current video before
offering choices. Resolve exactly one variant per node, language and state.
Use runtime/story-player.mjs as the reference consumer. Save progress with
storyId, graphRevision, graphHash and edgeHistory; refuse incompatible saves.

manifest.json records hashes of every packaged file. Check hashes before
loading untrusted packages. Narrative IDs do not change across translations.
