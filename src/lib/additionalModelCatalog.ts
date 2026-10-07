import type { EngineFile, ModelFamily, ModelDir } from "./engineCatalog.ts";

const file = (
  repo: string,
  path: string,
  dir: ModelDir,
  size_mb: number,
): EngineFile => ({
  url: `https://huggingface.co/${repo}/resolve/main/${path}`,
  filename: path.split("/").pop()!,
  dir,
  size_mb,
});

/** These are separate architectures, never aliases for an older model. */
export const ADDITIONAL_FAMILIES: ModelFamily[] = [
  {
    id: "z-image-turbo",
    name: "Z-Image-Turbo",
    media: "image",
    license: "Apache-2.0",
    blurb:
      "Fast text-to-image generation. Generate a still here, then use it as the start frame in the video generator.",
    recipe: "8 steps · CFG 1 · res_multistep",
    shared: [
      file(
        "Comfy-Org/z_image_turbo",
        "split_files/text_encoders/qwen_3_4b.safetensors",
        "text_encoders",
        7673,
      ),
      file(
        "Comfy-Org/z_image_turbo",
        "split_files/vae/ae.safetensors",
        "vae",
        320,
      ),
    ],
    variants: [
      {
        id: "z-image-bf16",
        label: "BF16",
        precision: "fp16",
        vram_gb: 16,
        vramEstimated: true,
        quality: "original turbo weights",
        files: [
          file(
            "Comfy-Org/z_image_turbo",
            "split_files/diffusion_models/z_image_turbo_bf16.safetensors",
            "diffusion_models",
            11740,
          ),
        ],
      },
    ],
  },
  {
    id: "qwen-image21",
    name: "Qwen Image 2.1",
    media: "image",
    license: "Apache-2.0",
    blurb:
      "Qwen Image 2.1 text-to-image and reference composition through its own 2.1 encoder.",
    recipe: "25 steps · CFG 1 · native 2.1 reference encoder",
    shared: [
      file(
        "Comfy-Org/Qwen-Image-2.1",
        "text_encoders/qwen3vl_8b_int8_convrot.safetensors",
        "text_encoders",
        8918,
      ),
      file(
        "Comfy-Org/Qwen-Image-2.1",
        "vae/qwen_image_2.1_vae_bf16.safetensors",
        "vae",
        644,
      ),
    ],
    variants: [
      {
        id: "qwen21-int8",
        label: "int8 convrot",
        precision: "int8",
        vram_gb: 18,
        vramEstimated: true,
        quality: "quantised 2.1 weights",
        files: [
          file(
            "Comfy-Org/Qwen-Image-2.1",
            "diffusion_models/qwen_image_2.1_int8_convrot.safetensors",
            "diffusion_models",
            6920,
          ),
        ],
      },
    ],
  },
  {
    id: "ltx23",
    name: "LTX 2.3",
    media: "video",
    license: "LTX-2.x Community",
    blurb:
      "Native video and audio with the Gemma 3 encoder and VAEs embedded in the full checkpoint.",
    recipe: "8n+1 frames · 24fps · native audio",
    shared: [
      file(
        "Comfy-Org/ltx-2",
        "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "text_encoders",
        9010,
      ),
    ],
    variants: [
      {
        id: "ltx23-distilled",
        label: "distilled FP8",
        precision: "fp8",
        vram_gb: 32,
        vramEstimated: true,
        quality: "distilled checkpoint, fixed 8-step schedule",
        files: [
          file(
            "Lightricks/LTX-2.3",
            "ltx-2.3-22b-distilled-fp8.safetensors",
            "checkpoints",
            28164,
          ),
        ],
      },
      {
        id: "ltx23-dev",
        label: "dev FP8",
        precision: "fp8",
        vram_gb: 32,
        vramEstimated: true,
        quality: "development checkpoint with guided sampling",
        files: [
          file(
            "Lightricks/LTX-2.3",
            "ltx-2.3-22b-dev-fp8.safetensors",
            "checkpoints",
            27795,
          ),
        ],
      },
    ],
  },
];
