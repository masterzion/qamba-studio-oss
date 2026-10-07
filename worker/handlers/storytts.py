"""Exact structured speech through a provisioned loopback endpoint."""
import base64
import hashlib
from pathlib import Path
import tempfile
import requests
import media
import sb
import story_audio
from offline_policy import loopback_url


def speech_request(line,profile,voice):
    line=story_audio.normalize_line(line);caps=profile.get("capabilities") or []
    if f"language:{line['language']}" not in caps:raise ValueError("TTS profile does not declare this language")
    if (line["emotion"]!="neutral" or line["intensity"]!=0) and "emotion" not in caps:raise ValueError("TTS profile cannot apply emotion")
    if line["pace"]!=1 and "pace" not in caps:raise ValueError("TTS profile cannot apply pace")
    base=loopback_url(profile["baseUrl"]).rstrip("/")
    if profile["protocol"]=="qamba-tts-v1":return base+"/speech",{"model":profile["modelId"],"line":line,"voice":voice,"format":"wav"}
    if profile["protocol"]=="openai-compatible":
        if line["emotion"]!="neutral" or line["intensity"]!=0 or voice.get("referenceAudio"):raise ValueError("Cloning/emotion requires qamba-tts-v1")
        return base+"/audio/speech",{"model":profile["modelId"],"input":line["line"],"voice":voice["rootEntryId"],"speed":line["pace"],"response_format":"wav"}
    raise ValueError("Select qamba-tts-v1 or a compatible local speech endpoint")


def handle_story_dialogue(job):
    p=job.get("payload") or {};line=story_audio.normalize_line(p["line"]);profile=p["profile"]
    unit_id=p.get("production_unit_id")
    if unit_id:
        unit=sb.get(f"production_units?id=eq.{unit_id}")[0]
        graph=sb.get(f"story_graphs?id=eq.{unit['graph_id']}")[0]
        if unit["status"]=="stale" or unit["context_hash"]!=p.get("input_hash") or graph["revision"]!=unit["graph_revision"]:
            raise ValueError("Dialogue inputs no longer belong to the current production unit")
    voice_id = line["speaker_id"] or p.get("voice_root_id")
    if not voice_id: raise ValueError("Choose an approved reference voice for the narrator")
    root=sb.get(f"bible_entries?id=eq.{voice_id}")[0];canonical=(root.get("doc") or {}).get("canonical") or {}
    if canonical.get("rootEntryId")!=root["id"] or canonical.get("approval")!="approved":raise ValueError("Speech requires an approved canonical root identity")
    voice={"rootEntryId":root["id"],"referenceRevision":canonical["revision"]}
    with tempfile.TemporaryDirectory(prefix="qamba-story-tts-") as tmp:
        reference_id=root.get("voice_ref_asset_id")
        if reference_id:
            reference=sb.asset_by_id(reference_id);local=Path(tmp)/"reference.wav";media.b2_get(reference["b2_key"],str(local))
            if local.stat().st_size>20*1024*1024:raise ValueError("Voice reference exceeds 20 MiB")
            data=local.read_bytes();voice.update({"referenceAssetId":reference_id,"referenceHash":hashlib.sha256(data).hexdigest(),"referenceAudio":base64.b64encode(data).decode()})
        url,body=speech_request(line,profile,voice)
        provenance={k:v for k,v in voice.items() if k!="referenceAudio"}
        cache=story_audio.cache_key(line,provenance,{"id":profile["id"],"model":profile["modelId"]});key=f"audio/story-lines/{cache}.wav"
        found=sb.get(f"assets?b2_key=eq.{key}&select=id")
        if found:sb.job_done(job["id"],output_asset_id=found[0]["id"]);return
        output=Path(tmp)/"speech.wav"
        with requests.post(url,json=body,timeout=profile.get("timeoutMs",120000)/1000,allow_redirects=False,stream=True) as response:
            if response.status_code!=200:raise ValueError(f"Local speech endpoint returned {response.status_code}; hosted fallback is disabled")
            with output.open("wb") as out:
                size=0
                for chunk in response.iter_content(65536):
                    size+=len(chunk)
                    if size>256*1024*1024:raise ValueError("Speech output exceeds 256 MiB")
                    if sb.cancel_requested(job["id"]):raise ValueError("Speech generation canceled")
                    out.write(chunk)
        info=media.probe(str(output))
        if not info["has_audio"] or not info["duration_ms"]:raise ValueError("Speech endpoint returned no measurable audio")
        media.b2_put(str(output),key,content_type="audio/wav")
        asset=sb.register_asset(key,"audio",project_id=job["project_id"],content_type="audio/wav",source_job_id=job["id"],duration_ms=info["duration_ms"],origin="generated",meta={"production_unit_id":unit_id,"input_hash":p.get("input_hash"),"dialogue":line,"voice":provenance,"provider":{"id":profile["id"],"model":profile["modelId"]},"cacheKey":cache,"review":{"status":"pending"}},tags=["dialogue-line","story"])
        sb.job_done(job["id"],output_asset_id=asset["id"])
