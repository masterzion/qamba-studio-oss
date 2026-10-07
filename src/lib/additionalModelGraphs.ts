import type { BuildInput } from "./localGraphs.ts";
import type { ApiGraph } from "./workflowAdapter.ts";

/** Ported from ComfyUI's Text to Image (Z-Image-Turbo) blueprint. */
export function buildZImage(b: BuildInput): ApiGraph {
  if (b.refImages?.length || b.startImage)
    throw new Error(
      "Z-Image-Turbo's text-to-image recipe does not accept reference images",
    );
  if (b.loras.length)
    throw new Error(
      "This Z-Image-Turbo recipe does not support a LoRA stack yet",
    );
  return {
    1: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: b.variant.files[0].filename,
        weight_dtype: "default",
      },
    },
    2: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_4b.safetensors",
        type: "lumina2",
        device: "default",
      },
    },
    3: { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    4: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: b.prompt },
    },
    5: {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    6: {
      class_type: "EmptySD3LatentImage",
      inputs: { width: b.width, height: b.height, batch_size: 1 },
    },
    7: {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3 },
    },
    8: {
      class_type: "KSampler",
      inputs: {
        model: ["7", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        seed: b.seed,
        steps: b.sampling.steps,
        cfg: 1,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1,
      },
    },
    9: {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
    },
    10: {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: b.prefix },
    },
  };
}

/** Comfy-Org image_qwen_image_2_1_t2i / image_edit templates, without the optional prompt-rewriting LLM. */
export function buildQwen21(b: BuildInput): ApiGraph {
  if (b.loras.length)
    throw new Error(
      "This Qwen Image 2.1 recipe does not support a LoRA stack yet",
    );
  const g: ApiGraph = {
    1: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: b.variant.files[0].filename,
        weight_dtype: "default",
      },
    },
    2: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen3vl_8b_int8_convrot.safetensors",
        type: "qwen_image",
        device: "default",
      },
    },
    3: {
      class_type: "VAELoader",
      inputs: { vae_name: "qwen_image_2.1_vae_bf16.safetensors" },
    },
    4: {
      class_type: "TextEncodeQwenImage21",
      inputs: {
        clip: ["2", 0],
        prompt: b.prompt,
        negative_prompt: "",
        resolution: 1024,
        vae: ["3", 0],
      },
    },
    5: {
      class_type: "QwenImage21Cache",
      inputs: { model: ["1", 0], device: "auto", dtype: "default" },
    },
    6: {
      class_type: "EmptyLatentImage",
      inputs: { width: b.width, height: b.height, batch_size: 1 },
    },
    7: {
      class_type: "KSampler",
      inputs: {
        model: ["5", 0],
        positive: ["4", 0],
        negative: ["4", 1],
        latent_image: ["6", 0],
        seed: b.seed,
        steps: b.sampling.steps,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
      },
    },
    8: {
      class_type: "VAEDecode",
      inputs: { samples: ["7", 0], vae: ["3", 0] },
    },
    9: {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: b.prefix },
    },
  };
  const refs = b.refImages ?? [];
  if (refs.length > 16)
    throw new Error("Qwen Image 2.1 accepts at most 16 reference images");
  refs.forEach((image, i) => {
    const id = String(20 + i);
    g[id] = { class_type: "LoadImage", inputs: { image } };
    g["4"].inputs[`images.image_${i + 1}`] = [id, 0];
  });
  if (refs.length) g["7"].inputs.latent_image = ["4", 2];
  return g;
}

/** LTX 2.3 checkpoint loaders differ from 2.5's split weights. */
export function buildLtx23(b: BuildInput): ApiGraph {
  if (b.refImages?.length)
    throw new Error(
      "LTX 2.3 references need the IC-LoRA workflow; use a start/end frame here",
    );
  if (b.loras.length)
    throw new Error("This LTX 2.3 recipe does not support a LoRA stack yet");
  const ckpt = b.variant.files[0].filename;
  const frames = b.frames ?? 121;
  const g: ApiGraph = {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    2: {
      class_type: "LTXAVTextEncoderLoader",
      inputs: {
        text_encoder: "gemma_3_12B_it_fp4_mixed.safetensors",
        ckpt_name: ckpt,
        device: "default",
      },
    },
    3: { class_type: "LTXVAudioVAELoader", inputs: { ckpt_name: ckpt } },
    4: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: b.prompt },
    },
    5: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: b.negative },
    },
    6: {
      class_type: "LTXVConditioning",
      inputs: { positive: ["4", 0], negative: ["5", 0], frame_rate: 24 },
    },
    7: {
      class_type: "EmptyLTXVLatentVideo",
      inputs: {
        width: b.width,
        height: b.height,
        length: frames,
        batch_size: 1,
      },
    },
    8: {
      class_type: "LTXVEmptyLatentAudio",
      inputs: {
        frames_number: frames,
        frame_rate: 24,
        batch_size: 1,
        audio_vae: ["3", 0],
      },
    },
    10: {
      class_type: "LTXVConcatAVLatent",
      inputs: { video_latent: ["7", 0], audio_latent: ["8", 0] },
    },
    11: { class_type: "RandomNoise", inputs: { noise_seed: b.seed } },
    12: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler_ancestral_cfg_pp" },
    },
    13:
      b.variant.id === "ltx23-distilled"
        ? {
            class_type: "ManualSigmas",
            inputs: {
              sigmas:
                "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0",
            },
          }
        : {
            class_type: "LTXVScheduler",
            inputs: {
              steps: b.sampling.steps,
              max_shift: 2.05,
              base_shift: 0.95,
              stretch: true,
              terminal: 0.1,
              latent: ["7", 0],
            },
          },
    14: {
      class_type: "CFGGuider",
      inputs: {
        model: ["1", 0],
        positive: ["6", 0],
        negative: ["6", 1],
        cfg: b.sampling.cfg,
      },
    },
    15: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["11", 0],
        guider: ["14", 0],
        sampler: ["12", 0],
        sigmas: ["13", 0],
        latent_image: ["10", 0],
      },
    },
    16: {
      class_type: "LTXVSeparateAVLatent",
      inputs: { av_latent: ["15", 0] },
    },
    17: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["16", 0],
        vae: ["1", 2],
        tile_size: 512,
        overlap: 64,
        temporal_size: 4096,
        temporal_overlap: 4,
      },
    },
    18: {
      class_type: "LTXVAudioVAEDecode",
      inputs: { samples: ["16", 1], audio_vae: ["3", 0] },
    },
    19: {
      class_type: "CreateVideo",
      inputs: { images: ["17", 0], audio: ["18", 0], fps: 24 },
    },
    20: {
      class_type: "SaveVideo",
      inputs: {
        video: ["19", 0],
        filename_prefix: b.prefix,
        format: "auto",
        codec: "auto",
      },
    },
  };
  let guide = { pos: ["6", 0], neg: ["6", 1], latent: ["7", 0] };
  for (const [image, idx, id] of [
    [b.startImage, 0, 30],
    [b.endImage, -1, 32],
  ] as const) {
    if (!image) continue;
    g[String(id)] = { class_type: "LoadImage", inputs: { image } };
    g[String(id + 1)] = {
      class_type: "LTXVAddGuide",
      inputs: {
        positive: guide.pos,
        negative: guide.neg,
        latent: guide.latent,
        vae: ["1", 2],
        image: [String(id), 0],
        frame_idx: idx,
        strength: 1,
      },
    };
    guide = {
      pos: [String(id + 1), 0],
      neg: [String(id + 1), 1],
      latent: [String(id + 1), 2],
    };
  }
  g["10"].inputs.video_latent = guide.latent;
  g["14"].inputs.positive = guide.pos;
  g["14"].inputs.negative = guide.neg;
  if (b.startImage || b.endImage) {
    g["34"] = {
      class_type: "LTXVCropGuides",
      inputs: { positive: guide.pos, negative: guide.neg, latent: ["16", 0] },
    };
    g["17"].inputs.samples = ["34", 2];
  }
  return g;
}
