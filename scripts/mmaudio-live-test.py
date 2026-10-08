"""Render a real reference-workflow soundtrack without modifying project data."""
import argparse
import json
import sys
import time
import uuid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
from mmaudio_reference import graph, require_weights
import media


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--comfy", default="http://127.0.0.1:8188")
    parser.add_argument("--output", type=Path, default=Path(".test-output/mmaudio"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    require_weights(args.pack.resolve().parent.parent, "large_44k_v2")
    source = media.probe(str(args.video.resolve()))
    queue = requests.get(args.comfy + "/queue", timeout=30)
    queue.raise_for_status()
    queue = queue.json()
    if queue.get("queue_running") or queue.get("queue_pending"):
        raise RuntimeError("ComfyUI is busy; no test was queued")
    spec = requests.get(args.comfy + "/object_info/MMAudioVideoToAudio", timeout=30).json()
    if spec["MMAudioVideoToAudio"]["input"]["required"]["duration"][1]["min"] != 0:
        raise RuntimeError("Restart ComfyUI to load automatic video duration before this test")
    with args.video.open("rb") as stream:
        response = requests.post(args.comfy + "/upload/image", files={"image":
            (f"qamba_mmaudio_test_{uuid.uuid4().hex}.mp4", stream, "video/mp4")}, data={"type": "input"}, timeout=300)
    response.raise_for_status()
    uploaded = response.json()
    name = "/".join(filter(None, (uploaded.get("subfolder"), uploaded["name"])))
    built = graph(video=name, prompt="synchronized natural sound, footsteps and clothing movement", seconds=0, seed=42)
    (args.output / "graph.json").write_text(json.dumps(built["graph"], indent=2), encoding="utf-8")
    response = requests.post(args.comfy + "/prompt", json={"prompt": built["graph"], "client_id": str(uuid.uuid4())}, timeout=30)
    if not response.ok:
        raise RuntimeError(f"ComfyUI validation failed: {response.text}")
    pid = response.json()["prompt_id"]
    (args.output / "prompt.json").write_text(json.dumps({"prompt_id": pid, "source": source}, indent=2), encoding="utf-8")
    print(f"Submitted {pid}; source duration {source['duration_ms']}ms; MMAudio duration=0 (automatic)", flush=True)
    started = time.monotonic()
    while time.monotonic() - started < 1800:
        response = requests.get(args.comfy + f"/history/{pid}", timeout=30)
        response.raise_for_status()
        history = response.json().get(pid)
        if history and history.get("status", {}).get("completed"):
            (args.output / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
            if history["status"].get("status_str") == "error":
                messages = [m[1].get("exception_message") for m in history["status"].get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("MMAudio inference failed: " + "; ".join(filter(None, messages)))
            files = history.get("outputs", {}).get("3", {}).get("audio", [])
            if not files:
                raise RuntimeError("MMAudio finished without a saved audio output")
            audio = files[0]
            response = requests.get(args.comfy + "/view", params={k: audio[k] for k in ("filename", "subfolder", "type") if k in audio}, timeout=300)
            response.raise_for_status()
            dest = args.output / Path(audio["filename"]).name
            dest.write_bytes(response.content)
            result = media.probe(str(dest.resolve()))
            if not result.get("duration_ms") or abs(result["duration_ms"] - source["duration_ms"]) > 250:
                raise RuntimeError(f"Audio duration does not match video: {result}")
            (args.output / "result.json").write_text(json.dumps({"source": source, "audio": result, "file": str(dest.resolve()), "prompt_id": pid}, indent=2), encoding="utf-8")
            print(f"Saved {dest.resolve()}; audio duration {result['duration_ms']}ms matches source", flush=True)
            return
        time.sleep(2)
    raise TimeoutError("MMAudio test did not finish within 30 minutes; the prompt was left running")


if __name__ == "__main__":
    main()
