import React from "react";
import { useLocalEngine } from "../../hooks/useLocalEngine";
import { FAMILIES, POST_PROCESS, variantFiles } from "../../lib/engineCatalog";

export default function ComfyInventory() {
  const engine = useLocalEngine();
  const files = engine.status?.files ?? [];
  if (!engine.status?.live_comfy) return null;
  const owners = new Map<string, Set<string>>();
  for (const family of FAMILIES) for (const variant of family.variants) {
    for (const file of variantFiles(family, variant)) for (const name of [file.filename, ...(file.alternatives ?? [])]) {
      const labels = owners.get(name) ?? new Set<string>(); labels.add(family.name); owners.set(name, labels);
    }
  }
  for (const tool of POST_PROCESS) for (const file of tool.files) owners.set(file.filename, new Set([tool.name]));
  return <details className="ws-card" style={{ padding: 12, marginBottom: 12 }}>
    <summary>Detected model files in running ComfyUI ({files.length})</summary>
    <p style={{ fontSize: 12 }}>Includes ComfyUI's external model folders. Generator entries below name missing dependencies.
      Geometry, 3D and transcription weights can be listed here without an image/video generation recipe.</p>
    <div style={{ maxHeight: 280, overflow: "auto" }}>
      {files.slice().sort().map((name) => <div key={name} style={{ padding: "5px 0", fontSize: 11, overflowWrap: "anywhere" }}>
        <strong>{name}</strong><br />
        {owners.has(name) ? [...owners.get(name)!].join(", ") : "Detected weight · no generator recipe in this build"}
      </div>)}
    </div>
  </details>;
}
