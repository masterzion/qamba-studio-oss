# Story node editor implementation evidence

Implementation date: 7 October 2026, Europe/Riga. Existing uncommitted work was retained. No model weights were downloaded, and no commits or pushes were made.

## How to use the application

1. Click **Project settings** at the top right of the application. Click **Create branching story**, or select Interactive historical story as Narrative mode and open the top **Story Graph** navigation item.
2. Click **New story**. Enter its title, a default BCP 47 language such as `lv`, and optional additional languages such as `en, de-DE`. The language field accepts tags beyond those suggested by its searchable list.
3. The initial graph has exactly one START, a real SCENE blueprint, and END. **Add START** reveals the existing entry node; the graph still permits exactly one START, which cannot be deleted. Use **Add SCENE** and **Add END**; legacy decisions/conditionals and existing scene bindings are under **Advanced nodes**.
4. Single-click a SCENE card to edit its content and options in the right panel. **Timeline · language** selects a previously edited timeline from the same episode that is not linked to another scene, language, or production unit. **Create scene timeline** creates a cut when none is linked. Switching the selection retains the old cut, tracks and clips as a previous scene cut; that cut can be selected again. Each scene has one active editable timeline per language. Double-click the card, or click **Open timeline editor**, to open the selected timeline directly. **Return to story nodes** preserves language and graph viewport. The node editor no longer opens the scene popup or its Shots/Timeline dock tabs.
5. Change **Scene transition** from Continue to Decision with choices. The existing destination is retained as the first choice after confirmation. Add, translate, reorder or remove choices, then connect their individual sockets. Replacing an occupied socket preserves its edge UUID. Conversion back to Continue asks which connected branch to keep when there are several.
6. Select a language to edit its exact content. Missing text remains blank; another language's text is not copied automatically. Display fallback is identified on node titles and in the reference player. Speech production refuses missing exact dialogue translations.
7. **Undo**, **Redo** and **Save project** are available. The save status follows the native write: Saved, Saving, Unsaved changes or Save failed. A failed write preserves the draft for retry. Removing a narrative scene retains its blueprint, media and archived cut; restoring the node through undo reuses the cut.
8. Open **Simulate**, follow a path to a scene, choose its speech language and installed video model, and explicitly capture a production unit. This freezes dialogue IDs, selected-language text, shot projections, state and content hash. Review the final video before approval.
9. In that unit's **Measured subtitles** controls, read initial timing from measured dialogue clips or add cues and edit their start/end milliseconds. Select authored lines from the list; no JSON editing is required. Approve the timings with a review note. VTT and SRT files for declared subtitle languages are stored as project assets with hashes.
10. **Export → Authoring data** saves a clearly non-playable draft without requiring media. **Playable package** requires complete branch coverage, exact matching approved media for every declared speech language/state, current subtitle review and registered subtitle files.
11. Serve the exported folder with a local static HTTP server, then open `player.html`. For example, with Python installed: `python -m http.server 8765 --bind 127.0.0.1 --directory "<exported-package-folder>"`, then open `http://127.0.0.1:8765/player.html`. The player verifies manifest and file hashes before importing its runtime, plays the chosen media/subtitles, and offers choices after the scene finishes. It runs independently of Qamba.

## Implementation mapping and deliberate adaptations

| Tasks | Implementation |
| --- | --- |
| T01 | Inspected the existing React Flow editor, validated graph command, local persistence, timeline loader, worker handlers and Rust package writer; preserved the working-tree baseline. |
| T02–T04 | Discriminated v1/v2 graph documents, localized human-readable fields, strict version-dispatched runtime validation, language helpers, START rules, scene-native choice traversal and draft/readiness diagnostics. V1 fixtures remain separate from v2 contracts and conformance fixtures. |
| T05–T06 | `storyAuthoring.ts` consolidates migration and transactional scene creation. Upgrade preserves old revision documents and narrative IDs, adds START once, and wraps authored strings in language maps. A new scene uses a real project storyboard and beat. |
| T07–T08 | `SceneContentEditor.tsx` and `StoryInspector.tsx` consolidate dialogue/choice controls. Shared `storyPorts.ts`, dynamic handle layout and `useUpdateNodeInternals` preserve UUID-based connections across translation and reorder. |
| T09–T10 | Timestamped migrations and regenerated local schema add cut bindings and archive metadata. Both TypeScript and native writes validate scene/project/episode/language relationships and draft uniqueness. The bridge flushes native saves, refuses stale revisions, and uses request sequencing for rapid scene clicks. The existing scene modal accepts an optional story context. |
| T11 | Production context schema 2 freezes `storyContent` and `projectedBeats` inside each immutable unit, preserving the existing base storyboard identity and unit timeline guards. This is a unit-owned projection, rather than another mutable duplicate storyboard. Workers consume the captured projection. |
| T12 | Measured cue editor, reviewed timing/content hashes, subtitle asset registration and exact-language UTF-8 VTT/SRT serialization. Translation tracks share authored line IDs and the selected video's reviewed timings. |
| T13–T14 | Versioned frozen authoring/playable export, safe native copy/hash verification, dialogue/localization/subtitle files, and the standalone `director/story_player.mjs` plus `player.html`. The native writer ships those files under `runtime/` instead of introducing a separate example application. |
| T15–T16 | Synthetic visibly labeled scene/state/language videos; native writer qualification; independent checksum/runtime tests; actual browser video/subtitle playback; source/UI/worker/native checks and fresh desktop build. |
| T17 | Automated new-story, legacy-path, locale, editor, undo, persistence guard, export and independent player checks. A complete manual walkthrough inside the installed native window and listening review of generated speech remain separate human acceptance steps. |

Persisted SCENE `transitionMode` is inside `content`, keeping narrative authoring fields together. Scene/choice/line/edge identities remain separate UUIDs; language and filenames do not determine narrative identity. Existing version 1 packages retain their original manifest shape. Authoring-data export requires explicit upgrade to version 2.

## Validation scope

- TypeScript: `npx tsc --noEmit` passed.
- Complete JavaScript/TypeScript suite: 2,100 passed, 2 skipped, 0 failed. Log: `.story-node-tests-final.log`.
- Native Rust suite: 101 passed, 1 explicitly ignored synthetic-fixture qualification, 0 failed. Log: `.story-rust-tests-final.log`.
- The ignored native exporter qualification is also run explicitly after fixture preparation. Log: `.story-export-v2-rust.log`.
- Focused Python worker checks: 9 passed, 0 failed. Log: `.story-worker-tests-final.log`. This does not claim the entire Python repository suite passed.
- Story browser UI: both legacy paths, state analysis, new START/SCENE/END authoring, language independence, editor tabs, undo/redo and native-save failure/retry through the browser's mock bridge. Log: `.story-ui-final.log`. Browser mock storage is not an installed native window qualification.
- Independent package consumer: manifest/file SHA-256 checks, both ending witnesses, per-language presentation matching, premature/duplicate decision refusal and save/restore checks.
- Standalone exported browser player: four actual synthetic video/subtitle playbacks covering two branches in Latvian and English; saved-state incompatibility and tampered-file rejection. Evidence under `.test-output/story-player/`.

Meaningful focused tests include scene deletion/undo with cut retention, foreign/missing/duplicate native cut bindings, captured localized projection validation, immutable production inputs, subtitle hour boundaries and injection refusal, and failed subtitle file writes preventing asset registration.

## Reproduction commands

```powershell
npx tsc --noEmit
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
# Run the following from worker/:
python -m pytest tests/test_story_extension.py tests/test_tts_language.py -q
# Return to the repository root:
node scripts/story-ui-test.mjs
node scripts/story-export-fixture.mjs --v2
cargo test --manifest-path src-tauri/Cargo.toml --lib consumer_fixture_package -- --ignored
$storyPackagePath = (Get-Content .test-output/story-export/package-path.txt -Raw).Trim()
node scripts/story-package-test.mjs $storyPackagePath
node scripts/story-player-ui-test.mjs $storyPackagePath
npm run tauri:build -- --no-bundle
```

The story UI harness requires the existing Vite preview at port 5177 or a `BASE` override. Qualification media is synthetic and locally generated by FFmpeg. Prepare a fresh fixture before repeating native packaging: the writer intentionally refuses overwriting an existing package.

## Build and remaining review

Fresh executable: [`qamba-studio-20261007-1945-story.exe`](../src-tauri/target/release/qamba-studio-20261007-1945-story.exe), beside its packaged worker/workflow/contract resources. Native compilation completed at **19:45:42 Europe/Riga**. The application header displays frontend build time **2026-10-07 19:41:55**, version **0.2.3**. The standard `qamba-studio-desktop.exe` was also rebuilt successfully. Build log: `.desktop-build-story-final.log`.

Executable size: 14,972,928 bytes. SHA-256:

```text
1B860472BABFEECA2BF35BC12910428868F3D62080F2F2B074049D8930113F8E
```

The production JS contains the new creation/subtitle controls; packaged resources contain version 2 graph/package/state schemas, conformance fixtures and the updated worker context validator. No Unity, Unreal or Godot plugin is claimed; the package and reference runtime are engine-neutral.

Final playable-package receipt: [manifest.json](../.test-output/story-export/chronolatvia-2d99a2d2-8574-4e72-8a8f-ba6450c9929f-2-685107c9dc24/manifest.json), format 2, engine 2.0.0, playable true, Latvian/English. Verified manifest content hash:

```text
685107c9dc24240965111fe64f3eda4e9c3737342209c8401ed11ee954d900c9
```

Final native authoring-package receipt: [manifest.json](../.test-output/story-export/chronolatvia-ac3dcd20-18af-4c23-aa8c-58ed04c17c72-1-2c442482600e/manifest.json), format 2, playable false, without media generation. Its native packaging and independent checksums/graph validation passed. Log: `.story-export-authoring-rust.log`. Verified content hash: `2c442482600ebf78234535cb217eecd686673d1f75db47630b941beb989d3c41`.

Evidence artifacts: [editor canvas](../.test-output/story-ui/desktop.png), [scene and decisions in the independent player](../.test-output/story-player/scene-and-decisions.png), [Latvian first ending](../.test-output/story-player/lv-ending-1.png), [Latvian second ending](../.test-output/story-player/lv-ending-2.png), [four browser playback witnesses](../.test-output/story-player/browser-witnesses.json), and [runtime ending witnesses](../.test-output/story-export/playback-witnesses.json). The playable package contains both-language subtitle samples under `subtitles/<presentation-id>/`. Qualification videos contain visible scene/state/language identifiers and subtitle tracks; they do not claim real synthesized speech or an actual listening review.

Task-related source groups: `src/components/story/`, `src/lib/story*.ts`, `src/lib/productionContext.ts`, `src/lib/db/storyGraphs.ts`, `src/lib/db/timeline.ts`, `src/lib/db/types.ts`, `src/lib/localPlane.ts`, `src/lib/localStore.ts`, `src/lib/localSchema.ts`, `src/routes/Workspace.tsx`, `src/stores/useWorkspaceStore.ts`, the existing scene/project settings modals, `director/story_runtime.js`, `director/story_player.mjs`, `director/story_player.html`, `src-tauri/src/storyexport.rs`, `src-tauri/src/localstore.rs`, native resource configuration, versioned story contracts, timestamped story migrations, worker context/dialogue handlers and the story qualification scripts. Existing model/upload/provider work in the baseline was preserved.

Human acceptance still includes speech listening/emotion quality, visual quality of model-generated video, and the full walkthrough in the installed native application. These are not established by synthetic clips or mocked browser storage.
