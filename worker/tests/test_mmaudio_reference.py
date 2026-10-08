import pytest
from mmaudio_reference import graph, require_weights


@pytest.fixture(autouse=True)
def isolated_desktop_install(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))


def test_reference_graph_preserves_parameters_and_saves_audio():
    built = graph(video="clip.webm", prompt="footsteps", negative="music", seconds=7.5,
                  cfg=6, steps=35, seed=123)
    g = built["graph"]
    assert g["1"] == {"class_type": "LoadVideo", "inputs": {"file": "clip.webm"}}
    assert g["2"]["inputs"] == dict(video=["1", 0], prompt="footsteps", negative_prompt="music",
        variant="large_44k_v2", duration=7.5, cfg_strength=6, num_steps=35, seed=123)
    assert g["3"]["class_type"] == "SaveAudio"
    assert g["3"]["inputs"]["audio"] == ["2", 0]
    assert built["outputs"] == ["3"]


def test_empty_checkpoint_is_not_an_installed_model(tmp_path):
    root = tmp_path / "custom_nodes" / "MMAudio" / "weights"
    root.mkdir(parents=True)
    (root / "mmaudio_large_44k_v2.pth").touch()
    with pytest.raises(RuntimeError, match="missing or empty.*mmaudio_large_44k_v2"):
        require_weights(tmp_path, "large_44k_v2")


def test_encoder_cache_required_before_submission(tmp_path, monkeypatch):
    root = tmp_path / "custom_nodes" / "MMAudio"
    for name in ("weights/mmaudio_large_44k_v2.pth", "ext_weights/v1-44.pth", "ext_weights/synchformer_state_dict.pth"):
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b"checkpoint")
    monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path / "hub"))
    with pytest.raises(RuntimeError, match="already cached apple"):
        require_weights(tmp_path, "large_44k_v2")


@pytest.mark.parametrize("over", [{"variant": "invalid"}, {"seconds": 61}, {"cfg": -1}, {"steps": 101}])
def test_invalid_parameters_refused(over):
    with pytest.raises(ValueError):
        graph(video="clip.mp4", prompt="sound", **over)


def test_reference_handler_uses_measured_video_length_and_converts_saved_flac(monkeypatch):
    from handlers import v2a
    src = {"id": "source", "kind": "video", "b2_key": "clip.mp4", "duration_ms": 8000}
    monkeypatch.setattr(v2a.sb, "asset_by_id", lambda _: src)
    monkeypatch.setattr(v2a, "_has_node", lambda _: True)
    monkeypatch.setattr(v2a.mmaudio_reference, "require_weights", lambda *_: None)
    monkeypatch.setattr(v2a.R, "v2a_model", lambda _: pytest.fail("reference workflow must not resolve Kijai weights"))
    monkeypatch.setattr(v2a, "_stage_http", lambda *_: ("shared-input.mp4", 5200))
    submitted = []
    monkeypatch.setattr(v2a.comfy, "submit", lambda g: submitted.append(g) or "prompt")
    monkeypatch.setattr(v2a.comfy, "wait", lambda *_args, **_kw: {})
    monkeypatch.setattr(v2a.comfy, "fetch_output", lambda *_: "MMAudio.flac")
    converted = []
    monkeypatch.setattr(v2a.media, "run_ff", lambda args, **kw: converted.append(args))
    monkeypatch.setattr(v2a.media, "b2_put", lambda *_args, **_kw: None)
    monkeypatch.setattr(v2a.media, "probe", lambda _: {"duration_ms": 5200, "bytes": 1000})
    registered = []
    monkeypatch.setattr(v2a.sb, "register_asset", lambda key, kind, **kw: registered.append(kw) or {"id": "audio"})
    monkeypatch.setattr(v2a.sb, "job_patch", lambda *_: None)
    monkeypatch.setattr(v2a.sb, "job_progress", lambda *_args, **_kw: None)
    monkeypatch.setattr(v2a.sb, "job_done", lambda *_args, **_kw: None)
    monkeypatch.setattr(v2a, "_queue_ingest", lambda *_: None)
    v2a.handle_v2a_gen({"id": "job", "payload": {"source_asset_id": "source", "duration_ms": 8000,
        "mmaudio_workflow": "MMAudioVideoToAudio", "seed": 42, "prompt": "footsteps"}})
    assert submitted[0]["2"]["inputs"]["duration"] == 5.2
    assert submitted[0]["3"]["class_type"] == "SaveAudio"
    assert "libmp3lame" in converted[0]
    assert registered[0]["meta"]["requested_ms"] == 5200
    assert registered[0]["meta"]["source_asset_id"] == "source"
