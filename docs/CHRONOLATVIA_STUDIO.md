# ChronoLatvia interactive story studio

This document describes the implemented local workspace, its operating steps, and the evidence required before calling a historical production ready. The detailed design remains in `CHRONOLATVIA_IMPLEMENTATION_PLAN.md`.

## Implemented architecture

Existing Qamba scene/beat blueprints, Bible entities, assets, blocks, takes, jobs and cuts remain the production system. A story graph references scene UUIDs; it does not duplicate scenes when branches reconverge. Production units capture a particular graph revision, simulated state, canonical selections, historical references and predecessor inputs. Different visual states can produce independent takes and cuts of the same scene.

The runtime is `director/story_runtime.js`, engine version `1.0.0`. Simulation, analysis, production capture and exported consumer replay use that file. It accepts declared typed state paths and a bounded condition/effect DSL. It never executes authored expressions. Effects are ordered and transactional; invalid transitions retain the original state. Historical time cannot move backwards. Cycles, missing connections, invalid ports and project references block readiness. Bounded analysis reports `unknown` when proof cannot finish.

Graph documents and derived scene references are saved through one synchronous atomic store command with expected revision checking and previous-revision snapshots. Local project format is version 2. Version 1 projects gain linear narrative settings; the native loader first preserves their original bytes in a backup. Unknown tables and newer versions fail closed. Semantic edits invalidate production inputs. Layout edits preserve media and rebase units to the new graph revision.

Documented historical statements are locked against ordinary director/UI/Python writes. Human corrections require cited evidence and retain an audit history. Human review is required for historical facts, canonical identities, plates and final scene outputs. Generated jobs cannot approve themselves. Approved media changes require review again. Cited sources cannot be removed while records, graphs or units use them.

## Authoring a project

1. Open an existing local project. Click **Project settings** in the top bar, or open the sliders icon labelled **Project settings** in the left rail. Set **Narrative mode** to **Interactive historical story**; the **Story Graph** tab then appears in the top navigation. The top-bar settings modal also exposes **Offline only**; enable it for local production and set the language to `lv`.
2. Create the scene blueprints and shots with Qamba's existing storyboard tools. Keep one blueprint for a shared scene. Author separate short shots when an action or exact spoken line needs more than five seconds; the interactive planner rejects oversized shots rather than cutting dialogue.
3. Open **Story Graph**, create a story, and bind scene nodes to those blueprints. Each scene card has **Open video editor**, which opens its linked scene blueprint, shots and takes. For a particular branch variant, select the captured production unit and use **Review unit shots and takes**. Decision, condition and ending nodes describe narrative logic and do not own video. Add decisions, conditional nodes, historical events and endings. Connect scene/event `next` ports, choice UUID ports, conditional case ports or `fallback` to their targets. Ending nodes have no outgoing edge.
4. Declare state paths in **State**. Choose the type, default, numeric bounds or allowed values. Use these same paths in condition and effect editors. Removing a referenced declaration is rejected until its conditions/effects are removed.
5. Use the inspector to enter decision labels, historical annotations, explanations, citations and optional media. Use the preview/review controls to approve icon/poster/subtitle bytes. WebVTT subtitle files must be registered in the project library with `text/vtt` content type.
6. Run **Validate & analyze**. Resolve errors and check the ending witnesses and workload estimate. Workload counts are planning estimates; GPU seconds remain unmeasured rather than fabricated.
7. Open **Simulate**, start the story, select branches and inspect state. Save paths for debugging. Replaying an older path runs it against the selected current revision; stale sessions require restart. Check both routes through every reconvergence.

The synthetic conformance story is in `contracts/story/v1/fixtures/reconvergence.json`. Hide reaches the shared scene with suspicion 10 and no injury. Run reaches the same scene with suspicion 35 and a leg injury. The resulting endings differ. It is a test fixture, not historical content.

## Historical sources and canonical identities

Register citations, URLs, manual text or original local evidence in **Historical Bible**. A URL records provenance; it does not download or authenticate its contents. Text is immediately retrievable with local Unicode lexical search, without embeddings or hosted keys. Original uploads retain their SHA-256. Long-document OCR, PDF extraction and semantic embedding are not automatic in this extension; supply verified extracted text explicitly.

Classify statements as DOCUMENTED, PLAUSIBLE or FICTIONAL, attach locators and record uncertainty. Approve facts after human source review. **Correct statement with audit** preserves the previous statement, correction reason and cited evidence. Broader date/location corrections are available through the typed `correctHistoricalRecord` command; the current review panel edits statement text.

In **Canonical assets**, establish root/variant ancestry, revision and historical period, attach approved character/location/prop plates and record their orientation. Plate review records actual local file hashes. A root can declare a condition selecting a costume/injury variant for a specific story. Revise, then approve the identity and plates before production capture. Multiple matching rules are rejected. The reconstruction candidate panel queues 1-4 separate candidates from explicit source images and authored instructions using a provisioned image model. Model/reference incompatibility fails rather than substituting a different model. Candidate completion never establishes historical accuracy or approves canon.

## Local providers and offline policy

Configure provisioned servers in **Local providers** with exact model IDs, role, protocol, timeout and capabilities. Only literal loopback addresses or localhost are accepted. URLs cannot include credentials, queries or fragments. Profiles contain no hosted secrets. Native HTTP disables redirects and proxies. Python workers strip hosted credentials, reject outbound socket/DNS destinations and keep text fallback within the selected local protocol. Hosted generation jobs are refused when offline policy is enabled.

For LM Studio, use an OpenAI-compatible base such as `http://127.0.0.1:1234/v1`; declare `tools` for a text model only after verifying tool calls. For Ollama, use `http://127.0.0.1:11434` and the exact installed model name. ComfyUI defaults to port 8188. A configured `COMFY_URL` environment value is authoritative for workers; set it before starting the desktop app when using another port.

The engine settings **Local LLM** tab includes **Local text provider → LM Studio**. Enter its server URL, use **Check connection and list models**, choose the exact model ID from the complete dropdown, declare tool support if verified, then click **Use LM Studio**. The Creative Director and wizard model menus offer LM Studio and individual server models. Choosing an individual model uses that exact ID; Auto uses the selected local provider. Embedding models remain visible but cannot be selected for chat. The director, prompt helpers, and native planner use the configured local provider; choosing Ollama again preserves the LM Studio configuration. Server connection errors are displayed directly. Start the LM Studio server separately; LM Studio manages model loading.

The window title and workspace header show the application version and build timestamp in Europe/Riga. The Bible toolbar keeps **Style & models** beside its heading and wraps at narrow widths. The full-workspace regression test reproduced the original button extending beyond the window at 150% zoom and verified opening settings after the fix at 1024, 1400 and 1984 pixels and at 150% zoom.

Local structured speech accepts `qamba-tts-v1` or a compatible local speech endpoint. The first protocol sends POST `/speech` with `{model,line,voice,format:"wav"}` and expects WAV bytes. `line` contains exact text, speaker UUID, language, emotion, intensity and pace. `voice` contains the canonical root/revision and optional base64 reference audio. Declare `language:lv`, `emotion` and `pace` only when the endpoint actually supports them. The compatible `/audio/speech` adapter refuses cloning/emotion that its protocol cannot express. No TTS server or weight downloads are installed by this change.

Optional VLM advisory review requires a provisioned vision profile declaring `vision`. It sends the selected local candidate and captured requirements, records model/profile/prompt/file provenance, and preserves mandatory human approval. Its report cannot establish a documented historical claim.

Provision weights/custom nodes before testing offline production. Application policy is defense in depth, not an operating-system sandbox for independently running model servers. Final qualification must disable outbound network for the complete workstation and verify all selected services. Coordinate GPU memory manually for independently managed LM Studio/Ollama/TTS services; existing Qamba parking does not unload arbitrary external servers.

## Producing a scene variant

1. Simulate to the scene in the intended branch state. In its production panel select approved canonical identities and the installed desktop video-model key. Set an export presentation condition selecting that state.
2. Capture production inputs. The hash includes scene/beat content, effective visual state, canonical records/assets, historical source revisions, selected predecessor inputs and production settings. The capture validates scene cast/environment coverage, root identity, variant conditions and current plate approvals.
3. Generate scene composition candidates when needed with the unit's approved canonical inputs and captured shot/visual requirements. Review a candidate and include its approved asset ID in a new capture. Its source unit must match this scene, state and canonical inputs. Captured keyframes join the explicit video reference plan. Choose `r2v` references or `flf` first/last conditioning. The latter requires a one-shot scene and exactly two ordered composition IDs. Queue the reviewed video unit; model presence and the selected mode are checked first. Interactive render jobs require unit scope; whole-storyboard relaunch cannot bypass it. Existing kept takes prevent destructive unit relaunch. All jobs remain local.
4. Review shots/takes in the unit-scoped scene editor. Context changes retain late outputs as candidates; they cannot replace current approved media. Keeping a new take revokes that unit's final approval and invalidates actual chain dependants. Sibling units remain independent.
5. Generate exact dialogue with the structured speech panel. Listen for Latvian pronunciation, delivery, complete words and timing. Approve the measured audio after listening. A cache key includes exact text, controls, voice reference/revision and provider/model. Unsupported controls fail explicitly.
6. Build the scene cut from kept unit takes. Generated video audio is detached from this cut so exact dialogue is supplied on its own lane. Add measured Dialogue, Music, Ambience and SFX stems at explicit millisecond offsets. Duck music under dialogue; the automation uses the existing preview/render mixer.
7. For lip-sync, choose a reviewed unit video and approved final dialogue, speaker identity, segment start/end and provisioned model file/checksum manifest. Dialogue duration must match the segment; words are never truncated. LatentSync 1.5 requires LoadVideo, GetVideoComponents, LoadAudio, VideoLengthAdjuster, LatentSyncNode, CreateVideo and SaveVideo. The worker validates node availability and model checksums, then registers a pending-review output.
8. Render the mastered MP4 scene. The default target is -16 LUFS and -1 dB true peak with limiting and 48 kHz delivery. Listen to the completed mix and inspect the picture. Select it as final unit output and enter a playback review note. Native hashing/FFprobe records exact approved bytes and stream measurements. Production readiness still requires human content and lip-sync review; stream presence is not semantic proof.
9. Repeat for every reachable scene presentation. A shared scene can have separate healthy/injured units. Select existing captured units to resume work rather than recreating them.

## Portable package and consumer contract

Export freezes the project, validates graph/history/media readiness, enumerates reachable states and requires exactly one approved presentation per reachable scene state. Missing, overlapping, stale or unverified outputs block export. Changes during preparation require retry. No render is started automatically by export.

The native writer copies approved local bytes into a new staged folder, rejects traversal/symlinks escaping the project media root, verifies their review hashes, deduplicates SHA-addressed files, then renames the stage atomically. Existing packages are not overwritten. Output contains:

- `manifest.json`: format `chronolatvia-interactive-story`, formatVersion 1, engine 1.0.0, story/revision/language, file sizes/hashes and contentHash.
- `graph.json`: playable graph/state contract without editor layout or author-only metadata.
- `scenes.json`: node/blueprint IDs and condition-selected scene variants with media paths, stream measurements, context/canonical/source hashes and approval provenance.
- `assets.json`: referenced icons, posters, subtitles and original evidence mapped from stable asset IDs to copied media paths.
- `historical.json`: bibliography and reviewed historical records, including original evidence asset references.
- `runtime/story-runtime.mjs`: the exact shared runtime; `runtime/conformance.json`: witnessed ending edge histories and expected state/outcomes.
- `reports/validation.json`, SHA-addressed `media/` files and `LICENSE.txt`.

Resolve choice/scene presentation asset IDs through `assets.json`. Select a scene variant by evaluating its `when` condition against the current runtime state; require exactly one match. Call `startSession`, `listChoices`, `stepSession` and `replaySession` from the shipped runtime. Check manifest hashes before loading anything executable. The independent checker only executes a runtime identical to the studio's shipped version. The ChronoLatvia application repository has not been modified or tested as a consumer.

## Validation commands

Run from the repository root:

```powershell
npx tsc --noEmit
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri:build -- --no-bundle
```

Run worker tests from `worker` so existing relative-path tests execute correctly:

```powershell
python -X utf8 -m pytest tests -q -p no:cacheprovider
```

For browser mock qualification, start Vite on port 5177, then run `npm run test:story-ui`. `BASE` and `CHROME` can override the server/browser. Screenshots are written under `.test-output/story-ui`. This test does not prove native IPC, disk persistence or actual generation.

For native writer + independent consumer qualification, prepare a synthetic FFmpeg MP4, explicitly run the fixture test, then check the output:

```powershell
node scripts/story-export-fixture.mjs
cargo test --manifest-path src-tauri/Cargo.toml --lib consumer_fixture_package -- --ignored
$storyPackage = Get-Content .test-output/story-export/package-path.txt -Raw
node scripts/story-package-test.mjs $storyPackage
```

Repeated fixture exports intentionally reject an already-existing deterministic package; use a new fixture/output directory rather than overwriting it.

## Evidence and remaining qualification

Local verification recorded on 7 October 2026 (Europe/Riga):

- TypeScript checking passed. Node tests: 2,078 passed, 2 skipped, no failures.
- Rust library tests: 100 passed, no failures, one opt-in fixture test ignored in the regular suite. That fixture test was then explicitly run and passed.
- The native export fixture produced a real synthetic MP4 package. The independent consumer checked file hashes, both ending witnesses and exact scene-presentation bindings successfully.
- Worker tests: 2,347 passed, 1 skipped, 1 failed because Windows denied fixture symlink creation, as described below.
- The Windows release executable built successfully at `src-tauri/target/release/qamba-studio-desktop.exe`. This confirms compilation; browser interaction was tested through the mock desktop surface, not through native application automation.
- Library import sends bounded raw binary chunks instead of base64 JSON, advances progress after disk acknowledgement, and displays failed writes or timeouts. The original 2,142,581-byte user PNG passed exact-byte native chunk writing and a browser library test covering image display, checksum equality and visible disk errors. The original file was not changed.
- The fresh executable compiled at 18:05 on 7 October 2026 and is saved as `src-tauri/target/release/qamba-studio-20261007-1805.exe`. Windows blocked replacement of the running `qamba-studio-desktop.exe`; the dated file is an exact SHA-256 verified copy of the new compiled binary beside its updated resources. Save and close the old application before opening the dated executable. The older normal and `qamba-studio-updated.exe` files predate these model/language additions. Native application interaction remains a user verification step.

Verified on this Windows checkout: both simulated branches and their distinct state/endings; atomic saves/rollback; guarded approvals; production isolation; lexical Latvian retrieval; exact speech cache controls; real FFmpeg ducking/limiting; native package copying/checksums; independent consumer replay of both ending witnesses; browser mock desktop/mobile interaction. LM Studio's already loaded `gemma-4-e4b-it` returned a valid OpenAI-compatible tool call without a hosted key.

The full Python suite has one known environment failure: `test_a_symlinked_file_counts_as_present` cannot create its fixture because Windows returns WinError 1314. It remains a visible failure, not a weakened assertion. Run it on a workstation/CI runner with symlink capability.

ComfyUI at 127.0.0.1:8188 responds, but VideoLengthAdjuster and LatentSyncNode are absent. Real lip-sync qualification is blocked until those nodes and verified compatible weights are provisioned. Latvian TTS/cloning, VLM semantic QA, canonical reconstruction fidelity, real action continuity, human historical accuracy, final loudness listening review and a complete network-disabled production run remain unqualified. No large model downloads, real historical source claims, external consumer deployment, commits or pushes were performed.

The current extension provides explicit candidate generation, review, exact dialogue, lip-sync and mix controls. Automatic long-document extraction, automatic external-server GPU unloading and a turnkey ChronoLatvia in-game UI are separate remaining roadmap work. Dedicated real-media qualification of both video modes is still required. The implementation must not be described as a fully qualified six-workflow historical production until the real-media acceptance checks pass.

## Branching story nodes

Use Project settings → **Create branching story**, then **Story Graph** in the top navigation. New stories collect a title and languages and start with START → SCENE → END. Each SCENE owns localized dialogue and choices; its choice sockets determine the next node. Clicking a scene opens its Content, Shots and language-specific Timeline editor. The existing full timeline has a Return to story link.

Production is explicit under Story → Simulate: capture a scene/state/language unit, produce and review its video, then edit and review measured subtitle timings. Export Authoring data for a non-playable draft, or Playable package for reviewed videos, dialogue and subtitles. The exported `player.html` runs from a local HTTP server independently of Qamba and verifies package hashes before playback.

See [implementation evidence and usage](STORY_NODE_EDITOR_IMPLEMENTATION_NOTES.md) for controls, exact verification scope, synthetic playback evidence and build receipts.

## Installed generators and speech languages (7 October 2026)

The live ComfyUI loader inventory is merged with native disk discovery. Existing external model directories are detected without moving weights. Supported families with missing weights remain visible as download offers in Engine settings → Models; downloads require an explicit user action. Partial installations name their missing dependencies.

Image generation includes installed Z-Image-Turbo and Qwen Image 2.1. Z-Image generates stills; use its output as a start frame for a supported video model. It is not a video architecture. Flux 2 dev is visible but blocked until its own VAE is available; the existing `ae.safetensors` is not substituted.

In the Library generation dock, choose Video → the installed model → Input type → image → video, and attach a start image. Installed Wan 2.2 I2V 14B, MiniMax H3, LTX 2.3 dev/distilled and LTX 2.5 recipes accept start frames. LTX also offers first/last frames. The live-schema check covers each installed variant's image-to-video and first/last-frame graph; successful text-to-video generation is not proof of every variant's image-to-video output quality. Reference-video modes remain gated on their additional checkpoints or node packs.

Open Audio & Voice Studio → Voice, select a TTS model and use Speech language. All six imported Latvian Qwen workflows expose reference audio/transcript, token limit, effects and language. The source workflows are preserved under `workflows/latvian-tts`. Qwen offers its native languages plus a clearly labeled Latvian choice that maps to Auto. Supertonic 3 has a dedicated `lv` option, ten voice styles, speed and diffusion steps. Its customized controls include Feeling, Feeling intensity (0–1), trim silence, normalize volume, clarity boost, pitch (−12 to +12 semitones), time stretch (0.5–2), and chorus. Qamba sends `feeling` and `emotion_intensity` to `SupertonicTTS`, then routes audio through `SupertonicEffects` before `SaveAudio`. The current node advertises feeling/intensity as metadata only; pitch and the other effects alter the audio. These values are retained with the queued job and generated asset. Generation checks that the running ComfyUI exposes the customized inputs before submitting them. Its cached ONNX files are checked before generation to prevent its loader triggering an automatic download. ElevenLabs loads available Eleven v3 languages using the saved API key and forwards the selection as `language_code` for cast and cloned voices. OpenAI, Fish, Breeze and Voxtral adapters expose Auto only because their current speech interfaces do not accept a language override.

Live checks produced Z-Image PNG, Qwen Latvian FLAC, Supertonic Latvian FLAC and LTX 2.3 MP4 in `.test-output/models`. These confirm execution and output creation; listening review and image-to-video quality review remain separate acceptance steps. No model weights were downloaded during this integration.

## Audio-driven talking video

Open the project's Library, select Video, and choose an installed LTX 2.3 model. Under Input type, choose **image + audio → video · lip sync**. Add a starting image using **add** or **upload**, and use **audio** to select an uploaded or generated speech clip from the library. Dragging an image or audio library card onto the composer also fills its matching slot. Select the video duration; the driving audio is trimmed to that duration. Generate queues on the local lane and preserves the supplied speech as the output soundtrack. The audio latent is frozen during sampling so the video follows that recording.

For **ID-LoRA · image + reference voice**, select **LTX 2.3 · dev FP8**. This option requires `ltx-2.3-id-lora-talkvid-3k.safetensors` and the running ComfyUI's `LTXVReferenceAudio` node. The adapter is available under Local engine → Models → LTX 2.3 add-ons. Choose a starting image and a reference voice clip (about five seconds recommended), then write `[VISUAL]:`, `[SPEECH]:` and `[SOUNDS]:` sections in the prompt. ID-LoRA generates new speech in the reference speaker's voice; it does not preserve the reference recording as the soundtrack. The adapter loads automatically for this mode. It is not offered on the distilled checkpoint.

**InfiniteTalk · audio-driven full-body** is a separate local model in the video picker and Models download screen. Its single-speaker image + audio recipe uses the native `WanInfiniteTalkToVideo` node, Wan 2.1 I2V weights, the InfiniteTalk single-speaker model patch, wav2vec audio encoder, matching VAE and Lightx2v adapter. Missing weights are named and generation stays blocked until they are installed. Wan 2.2 weights are not substituted. This integration exposes image + audio generation; existing-video dubbing, multi-speaker masks and unlimited-length streaming are not exposed by this recipe.

Both audio modes retain the audio asset ID in the project job; reuse restores the selected audio alongside the image. Node-schema and UI queue checks do not qualify lip-sync accuracy or voice similarity; real generation and listening/viewing review are separate validation steps.

## MMAudio: video to synchronized audio

Local generation waits up to three hours, including model loading. This applies to desktop renders, workflow tests and bundled ComfyUI generation workers; individual HTTP requests retain their shorter connection limits. Cancellation remains available throughout the wait. This is render processing time, not a change to a model's maximum output video duration.

Within each local model family, automatic selection prefers installed, runnable Q4 GGUF variants, followed by other GGUF variants, then FP8/INT8 and full precision. GGUF requires an installed compatible loader. Explicit model selections and saved job model IDs remain unchanged, and this preference does not download weights or assume NVIDIA-only acceleration on AMD or Apple GPUs.

In the timeline workspace, open **Audio & voice studio** (speaker icon), select the **Video** tab, choose **MMAudio · Large 44k v2**, and pick a video from the library. Enter the desired sound sources, adjust the negative prompt, steps and guidance, then click **Score this clip**. The result is an audio library asset that can be added to an audio track. The timeline block's **Change audio** action uses the same workflow and publishes a new take with the soundtrack; it preserves the source picture and the previous takes.

When the linked ComfyUI exposes `MMAudioVideoToAudio`, the app uses `LoadVideo → MMAudioVideoToAudio → SaveAudio`, matching `workflows/mmaudio_video_to_audio.json`. Inputs are passed by name, so positional widget changes cannot put a model variant into the duration field. The worker uploads into the running ComfyUI input directory through HTTP, measures the actual source duration with FFprobe, and refuses videos outside 0.5–60 seconds. SaveAudio's FLAC output is converted to MP3 before registration and timeline muxing. The installed Kijai workflow remains supported on engines without the reference node.

Generation requires complete, nonempty checkpoints in the original `MMAudio` pack, plus the cached Apple CLIP encoder and NVIDIA BigVGAN vocoder. The cache installer is an explicit download operation: run the ComfyUI interpreter with `scripts/install-mmaudio-cache.py --pack <path-to-custom_nodes/MMAudio>`. It resumes downloads in separate temporary files and verifies the pack's checkpoint checksums before installation. Generation checks the cache and checksums and refuses missing or corrupt weights before inference.

For automatic duration directly in ComfyUI, run `scripts/patch-mmaudio-auto-duration.py --pack <path-to-custom_nodes/MMAudio>` and restart ComfyUI. The script backs up the supported wrapper before modifying it. In the repaired reference workflow, **duration 0** reads `video.get_duration()`; a positive value remains a manual override. Reload the JSON workflow after updating the node. The app independently measures duration and also works with the original node signature.
