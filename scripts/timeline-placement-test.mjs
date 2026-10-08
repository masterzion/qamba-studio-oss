import { build } from "esbuild";
import { createRequire } from "node:module";

// Run the real stores with in-memory persistence; no project data is changed.
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import assert from 'node:assert/strict';
      import { useTimelineStore as timeline } from './src/stores/useTimelineStore';
      import { useWorkspaceStore as workspace } from './src/stores/useWorkspaceStore';
      globalThis.placementTest = (async () => {
      assert.equal(workspace.getState().autoAlign, false);
      assert.equal(workspace.getState().snap, true);
      workspace.getState().toggle('autoAlign');
      assert.equal(workspace.getState().snap, true);
      workspace.getState().toggle('autoAlign');
      workspace.getState().toggle('snap');
      assert.equal(workspace.getState().autoAlign, false);
      const asset = { id: 'media', b2_key: 'media.flac', duration_ms: 2000 };
      for (const kind of ['audio', 'video']) {
        timeline.setState({ tracks: [{ id: kind, kind }], clips: [], timeline: null,
          undoStack: [], redoStack: [] });
        await timeline.getState().insertAsset(asset, kind, 12000, { durationMs: 2000 });
        assert.equal(timeline.getState().clips[0].t_start_ms, 12000);
        await timeline.getState().insertAsset(asset, kind, 25000,
          { durationMs: 2000, insertIndex: 0 });
        assert.deepEqual(timeline.getState().clips.map(c => c.t_start_ms), [12000, 25000]);
        workspace.getState().set('autoAlign', true);
        await timeline.getState().insertAsset(asset, kind, 40000, { durationMs: 2000 });
        assert.deepEqual(timeline.getState().clips.map(c => c.t_start_ms), [0, 2000, 4000]);
        workspace.getState().set('autoAlign', false);
      }
      console.log('Audio/video placement, gaps, assembly mode and independent snapping passed');
      })();
    `,
  },
  bundle: true, platform: "node", format: "cjs", write: false,
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "memory-persistence", setup(builder) {
    builder.onResolve({ filter: /\/db\/(timeline|assets)$/ }, args =>
      ({ path: args.path, namespace: "memory" }));
    builder.onLoad({ filter: /.*/, namespace: "memory" }, args => ({ contents:
      args.path.endsWith('/assets')
        ? 'export const ensureAssetDuration = async a => a; export const loadAssetsByIds = async () => [];'
        : `let id=0; export const insertClip=async c=>({...c,id:String(++id)});
           export const updateClip=async()=>{}, updateTrack=async()=>{}, markStale=async()=>{},
             setBlockExclusions=async()=>{}, restoreTracks=async()=>{}, restoreClips=async()=>{},
             relinkClips=async()=>{}, deleteClip=async()=>{}, deleteTrack=async()=>{},
             loadTimeline=async()=>{}, addTrack=async()=>{}, replaceAssetEverywhere=async()=>{};`
    }));
  }}],
});
const require = createRequire(import.meta.url);
const source = result.outputFiles[0].text;
await new Function("require", `${source}; return globalThis.placementTest;`)(require);
