// Running one job on the machine's own ComfyUI, end to end.
//
// THE ASSET PATH IS THE HALF THAT IS NOT OBVIOUS. Submitting a graph is easy;
// what stopped local rendering existing is that a pod render ends with the
// worker uploading to B2 and writing an `assets` row, and a local render ends
// with a file in `ComfyUI/output`. Nothing in this app can show that file: the
// library, the timeline, the picker and every reference resolve media through
// `assets.b2_key` (invariant #2). So the render is not finished when ComfyUI
// says it is — it is finished when the bytes are in the bucket and the row
// exists, and this module owns both.
//
// PROGRESS COMES OFF THE ENGINE'S OWN LOG. ComfyUI pushes step progress over a
// websocket and exposes it nowhere else; the webview cannot use that socket
// because it cannot set the Origin header ComfyUI's `origin_only_middleware`
// demands, which is the same wall `comfyHeaders` exists to get over for plain
// HTTP. The log tail is already a Tauri command (`engine_log`) and carries the
// sampler's own `N/M`, so that is what is read. It works only for an engine
// this app started; anything else degrades to elapsed time, which is honest
// rather than a bar that does not move.
import { httpFetch, invoke, isDesktop, engineStatus } from "./desktop.ts";
import { SUPERTONIC_ID, SUPERTONIC_DEFAULT_EFFECTS, buildSupertonic, type SupertonicInput } from "./supertonicTts.ts";
import {
  DEFAULT_COMFY, getOutputHistory, interrupt, submitPrompt, type HistoryOutput,
} from "./comfyLocal.ts";
import { resolveLocal, addonById } from "./localModels.ts";
import { POST_PROCESS } from "./engineCatalog.ts";
import { postRecipe, samplingFor, snapFrames } from "./localGraphs.ts";
import { resolveLoraPicks } from "./localLoras.ts";
import { applySlots, type ApiGraph } from "./workflowAdapter.ts";
import { loadWorkflow, recordTest } from "./db/customWorkflows.ts";
import { progressFromLog } from "./comfyProgress.ts";
import { assetUrl } from "./db/assets.ts";
import { OPEN_PROJECT_IO, type JobIO } from "./jobIO.ts";
import { attachToClip } from "./clipAttachIo.ts";
import type { Asset, Job } from "./db/types.ts";
import type { CustomWorkflow } from "./db/customWorkflows.ts";
import { buildLatvianTts, isLatvianTts, latvianPreset, type LatvianTtsInput } from "./latvianComfyTts.ts";
import { probedUploadMeta } from "./mediaProbe.ts";

/** How often the run loop asks the engine where it is. */
const TICK_MS = 1500;
/** A render this long has hung; ComfyUI is interrupted and the job fails. */
const MAX_MS = 3 * 60 * 60 * 1000;

export class LocalRenderError extends Error {}

/* ── talking to the engine ──────────────────────────────────────────────── */

const headers = (base: string): Record<string, string> => {
  try { return { origin: new URL(base).origin }; } catch { return {}; }
};

/**
 * Put an image where `LoadImage` can find it.
 *
 * ComfyUI's `/upload/image` is multipart and returns the name it stored under,
 * which is NOT always the name sent — it de-duplicates by appending a counter,
 * and using the requested name instead silently renders the wrong start frame
 * on the second job that uploads a file called `start.png`.
 */
export async function uploadToEngine(
  blob: Blob, filename: string, base = DEFAULT_COMFY,
): Promise<string> {
  const form = new FormData();
  form.append("image", blob, filename);
  form.append("overwrite", "false");
  const r = await httpFetch(`${base}/upload/image`, {
    method: "POST", headers: headers(base), body: form,
  });
  if (!r.ok) throw new LocalRenderError(`the engine refused the start frame (${r.status})`);
  const j = await r.json() as { name?: string; subfolder?: string };
  if (!j.name) throw new LocalRenderError("the engine stored the start frame under no name");
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/** Read an output back out of the engine as bytes. */
async function fetchBytes(url: string, base: string): Promise<Blob> {
  const r = await httpFetch(url, { headers: headers(base) });
  if (!r.ok) throw new LocalRenderError(`could not read the render back (${r.status})`);
  const buf = await r.arrayBuffer();
  return new Blob([buf]);
}

const EXT_TYPE: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", webp: "image/webp",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  // Audio landed the day the first local music model did. Without these an
  // mp3 registered as `application/octet-stream` AND as `kind: "image"` — so
  // it would have sat in the library as a broken thumbnail rather than as a
  // track, which is a wrong row rather than a failed render.
  mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", opus: "audio/opus",
  ogg: "audio/ogg", m4a: "audio/mp4",
};

const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

/* ── the job ────────────────────────────────────────────────────────────── */

export interface LocalJobPayload {
  instruct?: string;
  voice?: string;
  speed?: number;
  feeling?: SupertonicInput["feeling"];
  emotion_intensity?: SupertonicInput["emotion_intensity"];
  supertonic_effects?: SupertonicInput["supertonic_effects"];
  text?: string;
  language?: string;
  reference_asset_id?: string;
  reference_text?: string;
  max_new_tokens?: number;
  tts_effects?: LatvianTtsInput["tts_effects"];
  prompt?: string;
  negative?: string;
  mode?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  duration_ms?: number;
  start_asset_id?: string;
  end_asset_id?: string;
  audio_asset_id?: string;
  /** The row this render belongs on — `{clip_id}` from the timeline's own
   *  generate actions. See attachToClip. */
  target?: { clip_id?: string };
  ref_asset_ids?: string[];
  loras?: { key: string; strength?: number }[];
  /** An imported graph to run INSTEAD of a catalogue recipe (custom_workflows.id).
   *  The pod reads the same key in `handle_image_gen` / `handle_clip_gen`. */
  workflow_id?: string;
  /** music only: the words to sing, and whether to sing at all. */
  lyrics?: string;
  instrumental?: boolean;
  /** post only: which pass, over which clip, by how much. */
  post?: { tool: string; asset_id: string; factor?: number };
  label?: string;
  project_id?: string | null;
  engine_base?: string;
}

export interface RunHooks {
  /** 0..1, or -1 while the engine is loading weights and says nothing.
   *  `tick` is the poll count — a caller throttling its writes must let a
   *  changed tick through, or a stalled loop is indistinguishable from a slow
   *  one. */
  onProgress?: (pct: number, note: string, tick?: number) => void;
  /** true once the run should stop — the row's `cancel_requested` */
  isCanceled?: () => Promise<boolean> | boolean;
}

/**
 * What `graphForJob` decided, normalised across both planes.
 *
 * A catalogue render knows its recipe (steps, cfg, frame grid, media kind); an
 * imported graph knows NONE of that — the step count and sampler are the
 * author's, and the media kind is whatever its output node writes. So those
 * fields are nullable rather than defaulted: inventing `steps: 20` for a graph
 * that samples 8 would put a wrong number on the asset row, and this file's
 * own rule is that a value nobody measured is not recorded.
 */
export interface JobPlan {
  speech?: string;
  /** the imported workflow, when one is driving this render */
  custom: CustomWorkflow | null;
  /** the catalogue pick, when a recipe is */
  pick: ReturnType<typeof resolveLocal>;
  graph: ApiGraph;
  sampling: ReturnType<typeof samplingFor> | null;
  frames?: number;
  fps?: number;
  /** what to call it while it loads */
  label: string;
}

/** What one finished local render produced. */
export interface LocalResult {
  assets: Asset[];
  promptId: string;
  seconds: number;
}

/**
 * Build the graph a job describes.
 *
 * Split out from `runLocalJob` so it can be tested without an engine — the
 * graph is the part that is easy to get quietly wrong (a wrong VAE, a LoRA
 * spliced below the sampler, a frame count off the family's grid) and the part
 * a unit test can actually check.
 */
export async function graphForJob(
  job: Job, startImage?: string, io: JobIO = OPEN_PROJECT_IO, engineFiles?: string[],
  refImages: string[] = [], sourceVideo?: string,
  // The frame the render must ARRIVE at — see `BuildInput.endImage`. Trailing
  // and optional so every existing caller is untouched; only LTX 2.5's `flf`
  // reads it, and only because core's `LTXVAddGuide` takes a `frame_idx`.
  endImage?: string,
  inputAudio?: string,
): Promise<JobPlan> {
  const p = (job.payload ?? {}) as LocalJobPayload;

  if (job.model_id === SUPERTONIC_ID) {
    if (!(await engineStatus())?.supertonic_ready) throw new LocalRenderError("Supertonic 3 cache is incomplete. Generation was refused to prevent an automatic model download.");
    const response = await httpFetch(`${DEFAULT_COMFY}/object_info`, { headers: headers(DEFAULT_COMFY) });
    if (!response.ok) throw new LocalRenderError("Cannot verify Supertonic controls in ComfyUI.");
    const info = await response.json();
    const inputs = { ...info.SupertonicTTS?.input?.required, ...info.SupertonicTTS?.input?.optional };
    if (!inputs.feeling || !inputs.emotion_intensity || !info.SupertonicEffects)
      throw new LocalRenderError("Load your customized Supertonic TTS and Effects nodes, then restart ComfyUI. Feeling, intensity and effects were not submitted.");
    return { speech: "supertonic-3", custom: null, pick: null, sampling: null,
      graph: buildSupertonic(p, `qamba/${job.id}`), label: "Supertonic 3" };
  }

  if (isLatvianTts(job.model_id)) {
    if (p.instruct?.trim()) {
      const response = await httpFetch(`${DEFAULT_COMFY}/object_info/LatvianQwenReference`, { headers: headers(DEFAULT_COMFY) });
      if (!response.ok) throw new LocalRenderError("Cannot verify Qwen instruction support in ComfyUI.");
      const info = await response.json();
      const inputs = info.LatvianQwenReference?.input;
      if (!inputs?.optional?.instruct && !inputs?.required?.instruct)
        throw new LocalRenderError("Restart ComfyUI to load the updated Qwen Instruct input, then retry. Your instruction was not submitted.");
    }
    const preset = latvianPreset(job.model_id)!;
    return { speech: preset.id, custom: null, pick: null, sampling: null,
      graph: buildLatvianTts(job.model_id!, p, `qamba/${job.id}`, startImage), label: preset.label };
  }

  // AN IMPORTED GRAPH REPLACES THE RECIPE, exactly as it does on the pod.
  // `resolve_custom.py` and this branch are the two implementations of one
  // contract, and they have to refuse the same things: a graph is driven by
  // its TAGGED SLOTS and never by matching class_type, because class-matching
  // is safe only on templates we wrote.
  if (p.workflow_id) {
    const wf = await loadWorkflow(p.workflow_id, io.from);
    if (!wf) throw new LocalRenderError("that workflow is not in the library any more");
    if (!wf.api_graph || !Object.keys(wf.api_graph).length) {
      throw new LocalRenderError(`"${wf.name}" has no executable graph`);
    }
    const slots = wf.slots ?? {};
    // Same two refusals `resolve_custom` makes, and for the same reason: a
    // prompt that was ASKED FOR and has nowhere to go is the silent downgrade
    // — the render succeeds and hands back the author's own picture. `wrote`
    // is not returned by `applySlots`, so the condition is checked directly:
    // a slot must exist AND point at a node that is still in the graph, which
    // is precisely when `applySlots`' own `put` would no-op.
    const lands = (k: "prompt" | "start_frame") => {
      const slot = slots[k];
      return !!slot && !!wf.api_graph[slot.node];
    };
    if (p.prompt && !lands("prompt")) {
      throw new LocalRenderError(
        `"${wf.name}" has no prompt slot tagged, so the prompt would be ignored and the `
        + "workflow's own prompt would render. Tag the node that takes the prompt on the "
        + "workflow's card.");
    }
    if (startImage && !lands("start_frame")) {
      throw new LocalRenderError(
        `"${wf.name}" has no start-frame slot tagged, so the image you picked would be ignored.`);
    }
    const graph = applySlots(wf.api_graph, slots, {
      prompt: p.prompt, negative: p.negative?.trim() || undefined,
      seed: p.seed ?? 0, width: p.width, height: p.height,
      start_frame: startImage,
    });
    return { custom: wf, pick: null, graph, sampling: null,
             frames: undefined, fps: undefined, label: wf.name };
  }

  // A POST PASS takes a finished clip and hands back another one. It has no
  // model_id and no recipe — it is a TOOL, so it is resolved by its own id
  // and its input is staged as a VIDEO rather than as a start frame.
  if (p.post) {
    const r = postRecipe(p.post.tool);
    if (!r) throw new LocalRenderError(`"${p.post.tool}" is not a post pass this app has`);
    if (!sourceVideo) {
      throw new LocalRenderError("the clip this pass runs over was not staged");
    }
    const tool = POST_PROCESS.find((t) => t.id === r.tool);
    if (!tool) throw new LocalRenderError(`${r.tool} is not in the tool catalogue`);
    // Shaped as a family/variant so one builder signature serves both paths:
    // `variantFiles` is how every builder finds its weights, and a tool's
    // files are a flat list rather than a variant ladder.
    const fam = {
      id: tool.id, name: tool.name, media: "video" as const, blurb: tool.blurb,
      license: tool.license, shared: [], variants: [],
    };
    const variant = {
      id: tool.id, label: tool.name, precision: "fp16" as const,
      files: tool.files, vram_gb: tool.vram_gb, quality: "",
    };
    const graph = r.build({
      family: fam, variant, prompt: "", negative: "",
      width: 0, height: 0, seed: p.seed ?? 0,
      sampling: { steps: 1, cfg: 1, sampler: "euler", scheduler: "simple" },
      loras: [], prefix: `qamba/${job.id}`,
      sourceVideo, factor: p.post.factor,
    });
    return {
      custom: null, pick: null, graph, sampling: null,
      frames: undefined, fps: undefined, label: r.label,
    };
  }

  const pick = resolveLocal(job.model_id ?? "");
  if (!pick) {
    throw new LocalRenderError(
      `${job.model_id ?? "this model"} is not a model this machine can render`);
  }
  if (p.mode && !pick.recipe.modes.includes(p.mode)) throw new LocalRenderError("This model does not support the selected video input mode.");
  if (p.mode && pick.recipe.modeVariants?.[p.mode] && !pick.recipe.modeVariants[p.mode].includes(pick.variant.id))
    throw new LocalRenderError("ID-LoRA requires the LTX 2.3 development checkpoint.");
  if (p.mode && engineFiles && (pick.recipe.modeFiles?.[p.mode] ?? []).some((f) => !engineFiles.includes(f)))
    throw new LocalRenderError("The selected input mode's required adapter is missing. Get it from Local engine → Models.");
  // TWO SOURCES, ONE SHAPE. A catalogue add-on resolves through `addonById`;
  // a LoRA downloaded from the Civitai hub has no catalogue entry at all and
  // resolves through `localLoras`, whose key IS its filename. Before this, the
  // second branch did not exist and the `.filter()` below dropped every hub
  // LoRA silently — the render succeeded, unstyled, with nothing to say the
  // pick had been ignored.
  const picks = resolveLoraPicks(pick.family, p.loras ?? [], {
    addon: (key) => addonById(pick.family, key),
    // `undefined` means nobody asked the engine what is on disk (the unit
    // tests, which have no engine) — then the registry is trusted.
    onDisk: engineFiles ? new Set(engineFiles) : null,
  });

  const sampling = samplingFor(pick.recipe, pick.variant.id, picks,
                               p.steps ? { steps: p.steps } : {});

  const fps = pick.recipe.fps ?? 24;
  const frames = pick.recipe.kind === "video"
    ? snapFrames(pick.recipe, Math.round(((p.duration_ms ?? 4000) / 1000) * fps))
    : undefined;

  const graph = pick.recipe.build({
    family: pick.family, variant: pick.variant,
    // "instrumental" has to be SAID: an empty `lyrics` is an absence, not an
    // instruction, and both models sing whatever the caption implies. The
    // pod's own handler appends the same words for the same reason.
    prompt: p.instrumental
      ? `${p.prompt ?? ""}, instrumental, no vocals, no lyrics`.replace(/^, /, "")
      : (p.prompt ?? ""),
    // A recipe with no `negative` samples no negative branch (Krea 2 turbo at
    // cfg 1.0). The builders that take one still need a string, and "" is the
    // honest value there — not a stray default the user never chose.
    negative: (p.negative?.trim() || pick.recipe.negative || ""),
    width: p.width ?? 832, height: p.height ?? 480,
    seed: p.seed ?? 0,
    sampling, frames, startImage, endImage, refImages, mode: p.mode, inputAudio,
    // Seconds rather than frames: the audio models take a duration directly,
    // and Music 3 treats it as a CEILING its own planner may finish under.
    seconds: (p.duration_ms ?? 10_000) / 1000,
    lyrics: p.instrumental ? "" : (p.lyrics ?? ""),
    loras: picks,
    prefix: `qamba/${job.id}`,
    // What is on disk, so a builder with a genuine either/or can choose —
    // Krea 2 preferring the abliterated encoder when it is there.
    ...(engineFiles ? { have: new Set(engineFiles) } : {}),
  });
  return { custom: null, pick, graph, sampling, frames, fps, label: pick.family.name };
}

/**
 * Render `job` on the local engine and land the result in the library.
 *
 * Throws on any failure. The caller owns the job row's status — this function
 * deliberately does not write it, so the same code path can be exercised from
 * a test harness with no queue behind it.
 */
export async function runLocalJob(
  job: Job, hooks: RunHooks = {}, io: JobIO = OPEN_PROJECT_IO,
): Promise<LocalResult> {
  if (!isDesktop()) throw new LocalRenderError("local rendering needs the desktop app");
  const p = (job.payload ?? {}) as LocalJobPayload;
  const base = p.engine_base || DEFAULT_COMFY;
  const t0 = Date.now();

  // 1. any picture the graph will NAME has to be on the engine's disk first.
  //
  //    Two kinds, and they are not interchangeable: a start frame is the first
  //    frame of the render, a reference is something to compose FROM. The pod
  //    keeps the same split and so does the composer, so conflating them here
  //    would be the "has references, therefore r2i" inference that once made
  //    every edit hand back a different picture.
  const stage = async (assetId: string, name: string, what: string): Promise<string> => {
    const { data } = await io.from("assets").select("*").eq("id", assetId).maybeSingle();
    const url = assetUrl(data as Asset | null);
    if (!url) throw new LocalRenderError(`the ${what} is not in the library any more`);
    return uploadToEngine(await fetchBytes(url, base), name, base);
  };

  let startImage: string | undefined;
  if (isLatvianTts(job.model_id) && p.reference_asset_id) {
    const { data } = await io.from("assets").select("*").eq("id", p.reference_asset_id).maybeSingle();
    const reference = data as Asset | null;
    if (reference?.kind !== "audio") throw new LocalRenderError("Select an audio reference in this project's library");
    hooks.onProgress?.(-1, "sending reference audio to ComfyUI", 0);
    const name = `qamba_${job.id}_reference.${extOf(reference.b2_key) || "wav"}`;
    const url = assetUrl(reference);
    if (!url) throw new LocalRenderError("The reference audio is unavailable");
    startImage = await uploadToEngine(await fetchBytes(url, base), name, base);
  }
  if (p.start_asset_id) {
    hooks.onProgress?.(-1, "sending the start frame to the engine", 0);
    startImage = await stage(p.start_asset_id, `qamba_${job.id}.png`, "start frame");
  }

  // The frame the render must ARRIVE at. Distinct from the start frame all the
  // way down — two `LTXVAddGuide` nodes at `frame_idx` 0 and -1 — so it is
  // staged under its own name rather than joining `ref_asset_ids`, where it
  // would become a reference to compose FROM instead of an end to reach.
  let endImage: string | undefined;
  if (p.end_asset_id) {
    hooks.onProgress?.(-1, "sending the end frame to the engine", 0);
    endImage = await stage(p.end_asset_id, `qamba_${job.id}_end.png`, "end frame");
  }
  let inputAudio: string | undefined;
  if (p.mode === "ia2v" || p.mode === "idv") {
    if (!p.start_asset_id || !p.audio_asset_id) throw new LocalRenderError("Select an image and an audio clip for this video mode.");
    const { data } = await io.from("assets").select("*").eq("id", p.audio_asset_id).maybeSingle();
    const audio = data as Asset | null;
    if (audio?.kind !== "audio") throw new LocalRenderError("The driving/reference clip must be audio.");
    hooks.onProgress?.(-1, "sending the speech to the engine", 0);
    inputAudio = await stage(audio.id, `qamba_${job.id}_speech.${extOf(audio.b2_key) || "wav"}`, "speech audio");
  }

  // Staged in PICK ORDER and kept in it: the first reference is the one
  // `TextEncodeQwenImageEditPlus` anchors on, so a set that arrives shuffled
  // is a different composition, silently.
  const refImages: string[] = [];
  for (const [i, id] of (p.ref_asset_ids ?? []).entries()) {
    hooks.onProgress?.(-1, `sending reference ${i + 1} to the engine`, 0);
    refImages.push(await stage(id, `qamba_${job.id}_ref${i}.png`, "reference"));
  }

  // The engine's own file list, so a LoRA pick can be checked against the disk
  // rather than against a browser store that may have outlived the file.
  // Best effort: a status call that fails must not fail a render, and
  // `graphForJob` treats `undefined` as "not checked" rather than "empty".
  let engineFiles: string[] | undefined;
  try {
    engineFiles = (await invoke<{ files?: string[] }>("engine_status"))?.files ?? undefined;
  } catch { /* fall back to trusting the registry */ }

  // A post pass's input is a CLIP, and it goes to the engine as the video it
  // is — `LoadVideo` reads a container, not a PNG.
  let sourceVideo: string | undefined;
  if (p.post?.asset_id) {
    hooks.onProgress?.(-1, "sending the clip to the engine", 0);
    sourceVideo = await stage(p.post.asset_id, `qamba_${job.id}.mp4`, "clip");
  }

  const { graph } = await graphForJob(
    job, startImage, io, engineFiles, refImages, sourceVideo, endImage, inputAudio);

  // 2. submit. A refused graph comes back as a 400 naming the node, which is
  //    the single most useful line in the whole flow — `submitPrompt` keeps it.
  hooks.onProgress?.(-1, "sending the graph", 0);
  const { prompt_id } = await submitPrompt(graph, base);
  await io.from("jobs").update({ comfy_prompt_id: prompt_id }).eq("id", job.id);

  return attachLocalJob(job, prompt_id, hooks, t0, io);
}

/**
 * Wait for a prompt the engine is ALREADY running, then publish it.
 *
 * The reattach path, and the reason a local render survives a reload: the job
 * row carries `comfy_prompt_id`, the engine carries the render, and nothing
 * about a five-minute sample should depend on a React tree staying mounted.
 * `runLocalJob` finishes through here too, so the resumed path and the normal
 * one cannot diverge.
 */
export async function attachLocalJob(
  job: Job, prompt_id: string, hooks: RunHooks = {}, startedAt = Date.now(),
  io: JobIO = OPEN_PROJECT_IO,
): Promise<LocalResult> {
  const p = (job.payload ?? {}) as LocalJobPayload;
  const base = p.engine_base || DEFAULT_COMFY;
  const t0 = startedAt;
  const { custom, pick, sampling, frames, fps, label, speech } = await graphForJob(job, undefined, io);
  // ComfyUI's own refusal names the node and the class, which is the most
  // useful line in the whole import flow — it belongs on the workflow's card,
  // where the person who has to fix the graph looks, and not only on the job.
  // Best effort, exactly like `record_failure`: a render that already failed
  // must not fail differently because the bookkeeping did.
  const tell = async (ok: boolean, message?: string) => {
    if (!custom) return;
    try {
      await recordTest(custom.id, ok, ok ? undefined : { message: String(message).slice(0, 800) }, io.from);
    }
    catch { /* the render's own outcome is what matters */ }
  };
  try {
    return await runAndPublish();
  } catch (e) {
    await tell(false, (e as Error).message);
    throw e;
  }

  async function runAndPublish(): Promise<LocalResult> {

  // 3. wait. First sample of a cold model can be minutes with nothing to say,
  //    so the note distinguishes "loading" from "sampling" rather than sitting
  //    at 0%.
  let outputs: HistoryOutput[] = [];
  let tick = 0;
  let pct = -1;
  let note = "waiting for the engine";
  for (;;) {
    if (Date.now() - t0 > MAX_MS) {
      await interrupt(base).catch(() => {});
      throw new LocalRenderError("the engine did not finish in 3 hours");
    }
    // ONE write per iteration, at the TOP, carrying what the PREVIOUS poll
    // found — so the row is a heartbeat as well as a progress bar. Reporting
    // only after a successful poll makes a stalled loop and a slow engine look
    // identical from outside, which is the hole the first end-to-end run fell
    // into: twenty minutes on "sending the graph" with no way to tell whether
    // the loop had died or the sampler was simply thinking. The tick count is
    // the part that answers it.
    const mins = Math.round((Date.now() - t0) / 6000) / 10;
    hooks.onProgress?.(pct, `${note} · ${mins}m`, tick);

    if (await hooks.isCanceled?.()) {
      await interrupt(base).catch(() => {});
      throw new LocalRenderError("canceled");
    }
    const h = await getOutputHistory(prompt_id, base);
    if (h.error) throw new LocalRenderError(h.error);
    if (h.done) { outputs = h.outputs; break; }

    const tail = (await invoke<string>("engine_log", { lines: 4 })) ?? "";
    const step = progressFromLog(tail);
    pct = step ? Math.min(0.98, step.done / step.total) : -1;
    note = step
      ? `sampling ${step.done}/${step.total}`
        + (sampling ? ` · ${sampling.steps} steps` : "")
      : `loading ${label}`;
    tick++;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  if (!outputs.length) {
    throw new LocalRenderError(
      "the graph finished but wrote no file — its output node is a preview, not a save");
  }

  // 4. into the bucket, then into the registry. Invariant #2: the row is what
  //    makes it a thing the rest of the app can see.
  const assets: Asset[] = [];
  for (const [i, out] of outputs.entries()) {
    hooks.onProgress?.(0.99, `uploading ${out.filename}`, -1);
    const blob = await fetchBytes(out.url, base);
    // THE EXTENSION IS THE ONLY HONEST SOURCE FOR A CUSTOM GRAPH. A catalogue
    // recipe declares its media kind; an imported graph does not, and its
    // output node is whatever the author wired — so the file ComfyUI actually
    // wrote is what decides. The recipe stays the fallback for the catalogue
    // path, where it has always been right.
    const ext = extOf(out.filename)
      || (pick && pick.recipe.kind === "video" ? "mp4" : "png");
    const ct = EXT_TYPE[ext] ?? "application/octet-stream";
    // Three kinds now, from the FILE rather than from the recipe: an imported
    // graph declares no kind at all, and its output node is whatever the
    // author wired.
    const isVideo = ct.startsWith("video/");
    const isAudio = ct.startsWith("audio/");
    const key = `local/${job.id}${outputs.length > 1 ? `_${i}` : ""}.${ext}`;
    const file = new File([blob], key.split("/").pop()!, { type: ct });
    const probe = speech ? await probedUploadMeta(file) : {};
    await io.upload(file, key);
    assets.push(await io.register({
      b2_key: key,
      kind: isVideo ? "video" : isAudio ? "audio" : "image",
      project_id: p.project_id ?? job.project_id ?? null,
      content_type: ct,
      bytes: blob.size,
      ...probe,
      width: p.width, height: p.height,
      // No `asset_ingest` runs for these: that job is a POD handler, and
      // queueing one would park a row in the queue until someone starts a
      // GPU box. Everything ingest would have probed is already known here —
      // the render is the thing that chose them.
      ...(frames && fps ? { duration_ms: Math.round((frames / fps) * 1000) } : {}),
      origin: "generated",
      tags: ["library", "local", ...(speech ? ["voiceover", speech === "supertonic-3" ? "supertonic-3" : "latvian-tts"] : [])],
      meta: {
        prompt: p.prompt ?? "",
        local: true,
        engine: "comfyui",
        seed: p.seed,
        mode: p.mode,
        ...(p.audio_asset_id ? { audio_asset_id: p.audio_asset_id } : {}),
        // A custom graph names its own checkpoint and its own sampler, so
        // recording the model_id the picker happened to carry — or a step
        // count from a recipe that never ran — would state something untrue
        // about this render. Name the workflow instead, the same choice
        // handle_image_gen makes on the pod.
        ...(speech ? { model: job.model_id, workflow: speech === "supertonic-3" ? "SupertonicTTS" : latvianPreset(speech)!.source,
          text: p.text, instruct: p.instruct ?? "", reference_asset_id: p.reference_asset_id ?? null, reference_text: p.reference_text,
          reference_mode: p.instruct?.trim() ? "voice-design-expressive" : "supplied-reference",
          language: p.language ?? (speech === "supertonic-3" ? "en" : "Latvian"), voice: p.voice, speed: p.speed,
          ...(speech === "supertonic-3" ? { feeling: p.feeling ?? "neutral", emotion_intensity: p.emotion_intensity ?? 0.5,
            effects: { ...SUPERTONIC_DEFAULT_EFFECTS, ...p.supertonic_effects } } : { effects: p.tts_effects ?? {} }), pending_review: true } : custom
          ? { workflow_id: custom.id, workflow: `custom:${custom.name}` }
          : { model: job.model_id, family: pick!.family.id, variant: pick!.variant.id,
              steps: sampling!.steps, cfg: sampling!.cfg }),
        ...(frames ? { frames, fps } : {}),
        prompt_id,
      },
    }));
  }
    // Before the job reads `done`: the browser watches the job, and a clip
    // still holding a still when its render finishes is the bug this fixes
    // wearing a shorter timeout. Same ordering as the pod's `_attach_to_clip`,
    // which this is the twin of.
    await attachToClip(io, p.target, assets[0]);

    // A workflow is only ever proven by a render — never by a clean import.
    await tell(true);
    return { assets, promptId: prompt_id, seconds: Math.round((Date.now() - t0) / 1000) };
  }
}

