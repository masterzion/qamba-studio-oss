import json
import math
from pathlib import Path
import socket
import subprocess
import sys
import wave
import array
import pytest
import offline_policy
import story_audio
import story_production
import mix
from handlers import lipsync


def test_offline_urls_refuse_deceptive_hosts():
    for good in ("http://127.0.0.1:8189", "http://localhost:11434", "http://[::1]:1234/v1"):
        assert offline_policy.loopback_url(good) == good
    for bad in ("https://example.com", "http://localhost.evil.com", "http://u:p@localhost", "file:///tmp/a"):
        with pytest.raises(ValueError): offline_policy.loopback_url(bad)


def test_version_two_context_requires_localized_projection():
    context = {"schemaVersion": 2, "inputHash": "hash", "effectiveState": {}, "nodeId": "node", "canonicalSelections": [], "productionSettings": {"language": "lv", "projectedBeats": [], "storyContent": {"nodeId": "node", "language": "lv", "contentHash": "hash", "dialogue": []}}}
    assert story_production.validate_context(context) is context
    context["productionSettings"]["storyContent"]["language"] = "en"
    with pytest.raises(ValueError, match="localized dialogue"):
        story_production.validate_context(context)


def test_offline_socket_policy_blocks_outbound_without_credentials():
    # Separate process so the process-wide network policy cannot affect pytest.
    code = "import os,socket,offline_policy;os.environ['QAMBA_OFFLINE_ONLY']='1';os.environ['OPENAI_API_KEY']='synthetic';offline_policy.install();assert 'OPENAI_API_KEY' not in os.environ;s=socket.socket();s.connect(('8.8.8.8',443))"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode != 0
    assert "offline production blocked" in result.stderr


def test_lipsync_binds_final_audio_video_fps_and_seed():
    template = json.loads((Path(__file__).resolve().parents[2]/"workflows/lipsync_latentsync.json").read_text())
    graph=lipsync.build_graph(template,"unit.mp4","final.wav",24,123)
    assert graph["1"]["inputs"]["file"]=="unit.mp4"
    assert graph["3"]["inputs"]["audio"]=="final.wav"
    assert graph["4"]["inputs"]["silent_padding_sec"]==0
    assert graph["5"]["inputs"]["seed"]==123
    assert graph["6"]["inputs"]["fps"]==24
    assert template["1"]["inputs"]["file"]=="example.mp4"


def test_canonical_refs_are_exact_and_outdated_inputs_block():
    context={"schemaVersion":1,"inputHash":"test","effectiveState":{},"visualSignature":{},"canonicalSelections":[{"rootEntryId":"anna","variantEntryId":"injured","revision":2,"assetIds":["rear","face"]}]}
    entries={"injured":{"name":"Anna injured","doc":{"canonical":{"revision":2,"approval":"approved"}}}}
    refs=story_production.canonical_refs(context,entries)
    assert [r["asset_id"] for r in refs]==["rear","face"]
    entries["injured"]["doc"]["canonical"]["revision"]=3
    with pytest.raises(ValueError,match="changed"):story_production.canonical_refs(context,entries)


def test_speech_cache_preserves_lv_controls_reference_identity():
    line={"speaker_id":"anna","line":"  Es esmu šeit!  ","language":"lv","emotion":"fear","intensity":.5,"pace":1.1}
    assert story_audio.normalize_line(line)["line"]==line["line"]
    assert story_audio.cache_key(line,{"revision":1},{"model":"1"})!=story_audio.cache_key({**line,"pace":1.2},{"revision":1},{"model":"1"})
    with pytest.raises(ValueError):story_audio.master_filter({"targetLufs":2})


def test_real_ffmpeg_ducking_and_master_limit(tmp_path):
    track={"gain_db":0,"automation":[{"t_ms":0,"gain_db":0},{"t_ms":900,"gain_db":0},{"t_ms":1000,"gain_db":-12},{"t_ms":2000,"gain_db":-12},{"t_ms":2250,"gain_db":0},{"t_ms":4000,"gain_db":0}]}
    output=tmp_path/"ducked.wav"
    filt=mix.volume_filter(track)
    subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=4","-af",filt,"-c:a","pcm_s16le",str(output)],check=True,capture_output=True)
    with wave.open(str(output),"rb") as reader:
        rate=reader.getframerate(); samples=array.array("h",reader.readframes(reader.getnframes()))
    rms=lambda a,b:math.sqrt(sum(x*x for x in samples[int(a*rate):int(b*rate)])/((b-a)*rate))
    ratio=rms(1.2,1.8)/rms(.2,.8)
    assert .24<ratio<.27,ratio
    assert .95<rms(2.8,3.5)/rms(.2,.8)<1.05
    final=tmp_path/"master.wav"
    subprocess.run(["ffmpeg","-v","error","-i",str(output),"-af",story_audio.master_filter({"targetLufs":-16,"truePeakDb":-1}),"-c:a","pcm_s16le",str(final)],check=True,capture_output=True)
    with wave.open(str(final),"rb") as reader:
        samples=array.array("h",reader.readframes(reader.getnframes()))
        assert reader.getframerate()==48000
    assert max(abs(x) for x in samples)/32768<=10**(-1/20)+.002
