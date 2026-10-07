"""Deterministic dialogue metadata, final mastering, and scene output gates."""
import hashlib
import json


def normalize_line(line, language="lv"):
    result = {**line,"language":line.get("language",language),"emotion":line.get("emotion","neutral"),"intensity":line.get("intensity",0),"pace":line.get("pace",1)}
    speaker = result.get("speaker_id")
    if not isinstance(result.get("line"),str) or "speaker_id" not in result or not (speaker is None or isinstance(speaker,str) and bool(speaker)) or not 0 <= result["intensity"] <= 1 or result["pace"] <= 0:
        raise ValueError("Invalid structured dialogue")
    return result


def cache_key(line, voice, provider):
    value={"line":normalize_line(line),"voice":voice,"provider":provider}
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()


def master_filter(profile):
    lufs, peak = profile.get("targetLufs",-16), profile.get("truePeakDb",-1)
    if not isinstance(lufs,(int,float)) or not isinstance(peak,(int,float)) or not -24 <= lufs <= -9 or not -6 <= peak <= -0.1:
        raise ValueError("Master profile requires target -24..-9 LUFS and -6..-0.1 dB true peak")
    linear=10**(peak/20)
    return f"loudnorm=I={lufs}:TP={peak}:LRA=11,alimiter=limit={linear:.8f}:level=false,aresample=48000"
