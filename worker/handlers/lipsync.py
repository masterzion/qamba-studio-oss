"""Explicit local LatentSync post-process; never approves its own output."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import comfy
import media
import sb
from handlers.common import make_tick

REQUIRED_NODES = ("LoadVideo", "GetVideoComponents", "LoadAudio", "VideoLengthAdjuster", "LatentSyncNode", "CreateVideo", "SaveVideo")


def build_graph(template, video_name, audio_name, fps, seed=0):
    graph = {k: json.loads(json.dumps(v)) for k, v in template.items() if not k.startswith("_")}
    if {v["class_type"] for v in graph.values()} != set(REQUIRED_NODES):
        raise ValueError("Unsupported lip-sync template; verify the LatentSync workflow")
    graph["1"]["inputs"]["file"] = video_name
    graph["3"]["inputs"]["audio"] = audio_name
    graph["4"]["inputs"].update({"fps": fps, "silent_padding_sec": 0})
    graph["5"]["inputs"]["seed"] = seed
    graph["6"]["inputs"]["fps"] = fps
    return graph


def handle_lip_sync(job):
    p = job.get("payload") or {}
    if p.get("provider") != "latentsync-1.5" or p.get("workflow_id") != "lipsync_latentsync.json":
        raise ValueError("Select the provisioned local LatentSync 1.5 workflow")
    unit = sb.get(f"production_units?id=eq.{p['production_unit_id']}")[0]
    if unit["context_hash"] != p.get("input_hash") or unit["status"] == "stale":
        raise ValueError("Lip-sync inputs are stale")
    video, audio = sb.asset_by_id(p["video_asset_id"]), sb.asset_by_id(p["dialogue_asset_id"])
    if not video or not audio or any(a.get("meta", {}).get("review", {}).get("status") != "approved" for a in (video, audio)):
        raise ValueError("Human approval of final video and dialogue is required")
    info = comfy.object_info()
    missing = [n for n in REQUIRED_NODES if n not in info]
    if missing:
        raise ValueError(f"Install and verify ComfyUI-LatentSyncWrapper before production; missing nodes: {', '.join(missing)}")
    root = Path(os.environ["COMFY_ROOT"]).resolve()
    models = p.get("model_files") or []
    if not models:
        raise ValueError("Lip-sync needs an explicit provisioned model checksum manifest; automatic model download is not production")
    for model in models:
        path = (root / model["path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != model["sha256"]:
            raise ValueError("A required lip-sync model is missing or has changed; provision it before production")
    input_dir = root / "input"
    input_dir.mkdir(exist_ok=True)
    vn, an = f"story_{job['id']}.mp4", f"story_{job['id']}.wav"
    vp, ap = input_dir/vn, input_dir/an
    with tempfile.TemporaryDirectory(prefix="qamba-lipsync-") as tmp:
        srcv, srca, output = Path(tmp)/"video.mp4", Path(tmp)/"audio.wav", Path(tmp)/"output.mp4"
        media.b2_get(video["b2_key"], str(srcv)); media.b2_get(audio["b2_key"], str(srca))
        duration = p["end_ms"] - p["start_ms"]
        if p["start_ms"] < 0 or duration <= 0:
            raise ValueError("Invalid lip-sync segment bounds")
        audio_info = media.probe(str(srca))
        if abs(audio_info["duration_ms"] - duration) > 40:
            raise ValueError("Final dialogue must match the segment duration; retime the video rather than truncate words")
        fps = media.probe(str(srcv))["fps"]
        if not fps or fps <= 0:
            raise ValueError("Video frame rate is unavailable")
        media.run_ff(["-ss", str(p["start_ms"]/1000), "-i", str(srcv), "-t", str(duration/1000), "-an", "-c:v", "libx264", str(vp)], "lip-sync segment")
        media.run_ff(["-i", str(srca), "-c:a", "pcm_s16le", str(ap)], "lip-sync dialogue")
        try:
            template = json.loads((Path(os.environ["WORKFLOWS_DIR"])/"lipsync_latentsync.json").read_text(encoding="utf-8"))
            graph = build_graph(template, vn, an, fps, p.get("seed", 0))
            pid = comfy.submit(graph)
            outputs = comfy.wait(pid, on_tick=make_tick(job))
            comfy.fetch_output(outputs, ["7"], str(output))
            probe = media.probe(str(output))
            if not probe.get("has_audio") or abs(probe["duration_ms"]-duration)>1000/fps:
                raise ValueError("Lip-sync output failed stream/duration verification")
            key = f"story/{unit['id']}/lipsync_{job['id']}.mp4"
            media.b2_put(str(output), key)
            asset = sb.register_asset(key, "video", project_id=unit["project_id"], source_job_id=job["id"], origin="derived", duration_ms=probe["duration_ms"], width=probe["width"], height=probe["height"], fps=probe["fps"], meta={"production_unit_id": unit["id"], "input_hash": unit["context_hash"], "inputs": [video["id"], audio["id"]], "speaker_root_id": p["speaker_root_id"], "lipSync": p, "review": {"status": "pending"}})
            sb.job_done(job["id"], output_asset_id=asset["id"])
        finally:
            vp.unlink(missing_ok=True); ap.unlink(missing_ok=True)
