"""Install the cache used by MMAudioVideoToAudio in a specified ComfyUI pack.

Run with the ComfyUI interpreter: python install-mmaudio-cache.py --pack <MMAudio>.
Only explicitly running this installer downloads models; generation does not.
"""
import argparse
import ast
import hashlib
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from huggingface_hub import snapshot_download


def install_file(root, link):
    subdir = "weights" if link["name"].startswith("mmaudio_") else "ext_weights"
    dest = root / subdir / link["name"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    def checksum(path):
        digest = hashlib.md5()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    if dest.is_file() and checksum(dest) == link["md5"]:
        print(f"Already installed: {dest.name}", flush=True)
        return
    part = dest.with_suffix(dest.suffix + ".qamba-download")
    print(f"Downloading: {dest.name}", flush=True)
    # Preserve an interrupted checkpoint left by the pack's own downloader;
    # continue its bytes in a separate file and install only after verification.
    if dest.is_file() and dest.stat().st_size > (part.stat().st_size if part.exists() else 0):
        shutil.copyfile(dest, part)
    subprocess.run(["curl", "--location", "--fail", "--silent", "--show-error",
        "--retry", "3", "--connect-timeout", "30", "--speed-time", "60", "--speed-limit", "1024",
        "--continue-at", "-", "--output", str(part), link["url"]], check=True)
    if checksum(part) != link["md5"]:
        raise RuntimeError(f"Checksum mismatch for {dest.name}; checkpoint was not installed")
    os.replace(part, dest)
    print(f"Installed and verified: {dest.name}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", type=Path, required=True)
    args = parser.parse_args()
    root = args.pack.resolve()
    source = root / "mmaudio/utils/download_utils.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    links = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == "links" for t in n.targets))
    names = {"mmaudio_large_44k_v2.pth", "v1-44.pth", "synchformer_state_dict.pth"}
    with ThreadPoolExecutor(max_workers=3) as pool:
        tasks = [pool.submit(install_file, root, link) for link in links if link["name"] in names]
        for task in tasks:
            task.result()
    for repo, files in (
        ("apple/DFN5B-CLIP-ViT-H-14-384", ["open_clip_config.json", "open_clip_pytorch_model.bin"]),
        ("nvidia/bigvgan_v2_44khz_128band_512x", ["config.json", "bigvgan_generator.pt"]),
    ):
        print(f"Installing encoder/vocoder cache: {repo}", flush=True)
        snapshot_download(repo_id=repo, allow_patterns=files)
    print("MMAudio large_44k_v2 cache installed.", flush=True)


if __name__ == "__main__":
    main()
