"""Adapter for the user's LoadVideo -> MMAudioVideoToAudio -> SaveAudio workflow.

No imports from the GPU environment: the pipeline process and ComfyUI use
different Python installations. Check the installed pack's files before submission
because its loader otherwise downloads missing checkpoints automatically.
"""
from pathlib import Path
import os
import ast
import hashlib

VARIANTS = ("small_16k", "small_44k", "medium_44k", "large_44k", "large_44k_v2")


def require_weights(comfy_root, variant):
    if variant not in VARIANTS:
        raise ValueError(f"Unsupported MMAudio variant: {variant}")
    roots = [Path(comfy_root) / "custom_nodes" / "MMAudio"]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        installs = Path(local) / "Comfy-Desktop" / "ComfyUI-Installs"
        roots.extend(installs.glob("*/ComfyUI/custom_nodes/MMAudio"))
    root = next((p for p in roots if (p / "comfy_nodes.py").is_file()), roots[0])
    files = [f"weights/mmaudio_{variant}.pth", "ext_weights/synchformer_state_dict.pth",
             "ext_weights/v1-16.pth" if variant == "small_16k" else "ext_weights/v1-44.pth"]
    if variant == "small_16k":
        files.append("ext_weights/best_netG.pt")
    missing = [name for name in files if not (root / name).is_file() or (root / name).stat().st_size == 0]
    if missing:
        raise RuntimeError("MMAudio cache is incomplete (missing or empty: " + ", ".join(missing)
                           + "). Install the weights in your linked MMAudio pack before generating; no download was started.")
    # These encoders are loaded by FeaturesUtils from the Hugging Face cache,
    # independently of cfg.download_if_needed(). Do not let a render become
    # an implicit multi-gigabyte installation.
    hf_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    hub = Path(os.environ.get("HF_HUB_CACHE", os.environ.get("HUGGINGFACE_HUB_CACHE", hf_home / "hub")))
    repos = {"apple/DFN5B-CLIP-ViT-H-14-384": ["open_clip_config.json", "open_clip_pytorch_model.bin"]}
    if variant != "small_16k":
        repos["nvidia/bigvgan_v2_44khz_128band_512x"] = ["config.json", "bigvgan_generator.pt"]
    for repo, names in repos.items():
        cache = hub / ("models--" + repo.replace("/", "--"))
        ref = cache / "refs" / "main"
        snapshot = cache / "snapshots" / ref.read_text().strip() if ref.is_file() else None
        if snapshot is None or not all((snapshot / name).is_file() and (snapshot / name).stat().st_size > 0 for name in names):
            raise RuntimeError(f"MMAudio needs an already cached {repo} snapshot in {hub}. Install its encoder/vocoder cache before generating; no download was started.")
    source = root / "mmaudio/utils/download_utils.py"
    if not source.is_file():
        raise RuntimeError("Cannot verify MMAudio checkpoint checksums: its download manifest is missing")
    tree = ast.parse(source.read_text(encoding="utf-8"))
    links = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == "links" for t in n.targets))
    checksums = {link["name"]: link["md5"] for link in links}
    for name in files:
        digest = hashlib.md5()
        with (root / name).open("rb") as stream:
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != checksums.get(Path(name).name):
            raise RuntimeError(f"MMAudio checkpoint {name} is incomplete or corrupt. Run the cache installer to repair it; no inference or automatic download was started.")


def graph(*, video, prompt, negative="", variant="large_44k_v2", seconds=8.0,
          cfg=4.5, steps=25, seed=42):
    if variant not in VARIANTS:
        raise ValueError(f"Unsupported MMAudio variant: {variant}")
    if not (seconds == 0 or 0.5 <= seconds <= 60) or not 0 <= cfg <= 20 or not 1 <= steps <= 100:
        raise ValueError("MMAudio requires 0 (automatic) or 0.5–60 seconds, CFG 0–20, and 1–100 steps")
    return {"graph": {
        "1": {"class_type": "LoadVideo", "inputs": {"file": video}},
        "2": {"class_type": "MMAudioVideoToAudio", "inputs": {
            "video": ["1", 0], "prompt": prompt or "synchronized natural sound",
            "negative_prompt": negative, "variant": variant, "duration": seconds,
            "cfg_strength": cfg, "num_steps": steps, "seed": seed}},
        "3": {"class_type": "SaveAudio", "inputs": {
            "audio": ["2", 0], "filename_prefix": "audio/MMAudio"}},
    }, "outputs": ["3"]}
