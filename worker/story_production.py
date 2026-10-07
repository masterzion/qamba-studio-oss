"""Interpret captured presentation inputs; narrative transitions stay in JS."""
import json


def validate_context(context):
    if context.get("schemaVersion") not in (1, 2) or not context.get("inputHash") or not isinstance(context.get("effectiveState"), dict):
        raise ValueError("Invalid captured production context")
    if context["schemaVersion"] == 2:
        settings = context.get("productionSettings") or {}
        authored = settings.get("storyContent") or {}
        if authored.get("nodeId") != context.get("nodeId") or not authored.get("language") or authored.get("language") != settings.get("language") or not authored.get("contentHash") or not isinstance(authored.get("dialogue"), list) or not isinstance(settings.get("projectedBeats"), list):
            raise ValueError("Version 2 requires captured localized dialogue and shot projections")
    roots = [s["rootEntryId"] for s in context.get("canonicalSelections", [])]
    if len(roots) != len(set(roots)):
        raise ValueError("Select only one variant per root identity")
    return context


def presentation_note(context):
    validate_context(context)
    return "Required captured visual continuity: " + json.dumps(context["visualSignature"], ensure_ascii=False, sort_keys=True)


def canonical_refs(context, entries):
    validate_context(context)
    refs = []
    for selection in context["canonicalSelections"]:
        entry = entries[selection["variantEntryId"]]
        canonical = (entry.get("doc") or {}).get("canonical") or {}
        if canonical.get("approval") != "approved" or canonical.get("revision") != selection["revision"]:
            raise ValueError("A captured canonical reference changed; capture a new unit")
        for asset_id in selection["assetIds"]:
            refs.append({"slot":len(refs)+1,"label":entry["name"],"purpose":"approved captured canonical plate","asset_id":asset_id})
    return refs


def short_blocks(scene, beats, target_ms=4000):
    if not 2000 <= target_ms <= 5000:
        raise ValueError("Interactive segment target must be 2–5 seconds")
    result, at = [], 0
    for beat in beats:
        duration = int(beat.get("duration_ms") or target_ms)
        if duration > 5000:
            raise ValueError("Split this action into authored shots; dialogue must never be cut to fit a segment")
        duration = max(2000,duration)
        result.append({"idx":len(result),"scene_ids":[scene["id"]],"beat_ids":[beat["id"]],"t_start_ms":at,"t_end_ms":at+duration,"chain":bool(result)})
        at += duration
    return result
