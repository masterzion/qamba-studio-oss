import React, { useState } from "react";
import AssetPickerModal from "../modals/AssetPickerModal";
import { storyStore } from "../../lib/db/storyGraphs";
import { localMediaPath } from "../../lib/localMediaPath";
import { addSoundtrackPaths } from "../../lib/storySoundtracks";

export default function StorySoundtrackPicker({ projectId, paths, onChange }: {
  projectId: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const assets = storyStore(projectId).rows("assets");
  const pathFor = (asset: any) => localMediaPath(projectId, asset.b2_key) ?? asset.b2_key;
  const tray = (
    <div aria-label="Soundtrack drop area"
      style={{ border: `2px dashed ${over ? "#8fc2ff" : "#566074"}`, borderRadius: 10, padding: 14, maxHeight: 220, overflowY: "auto" }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/x-qamba-asset")) return;
        event.preventDefault(); event.stopPropagation();
        event.dataTransfer.dropEffect = "copy"; setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault(); event.stopPropagation(); setOver(false);
        const asset = assets.find((asset) => asset.id === event.dataTransfer.getData("application/x-qamba-asset"));
        if (asset) onChange(addSoundtrackPaths(paths, projectId, [asset as any]));
      }}>
      <p>Drag library tracks here, or select tracks and click Add.</p>
      {!paths.length && <p>No tracks selected. The game engine will clear the base soundtrack.</p>}
      {paths.map((path) => {
        const asset = assets.find((asset) => pathFor(asset) === path);
        const name = asset?.meta?.original_name ?? path.split(/[\\/]/).pop() ?? path;
        return <div key={path} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><strong>{name}</strong>
            <div style={{ fontSize: 11, overflowWrap: "anywhere", opacity: .7 }}>{path}</div>
          </div>
          <button aria-label={`Remove ${name}`} onClick={() => onChange(paths.filter((value) => value !== path))}>Remove</button>
        </div>;
      })}
    </div>
  );
  return <fieldset>
    <legend>Base sound track</legend>
    <p>Game engine only: these tracks remain active until another Base sound track node changes them.</p>
    <button onClick={() => setOpen(true)}>Browse soundtrack library</button>
    {tray}
    {!!paths.length && <button onClick={() => onChange([])}>Clear soundtracks</button>}
    {open && <AssetPickerModal projectId={projectId} title="Soundtrack library" kindFilter="audio" multi
      context="Drag audio into the soundtrack tray, or select several tracks and click Add. Changes are saved to this node only."
      draggableAssets dropTray={tray} closeLabel="Done" itemLabel="track"
      used={new Set(assets.filter((asset) => paths.includes(pathFor(asset))).map((asset) => asset.id))}
      onPick={(picks) => {
        onChange(addSoundtrackPaths(paths, projectId, picks.map((pick) => pick.asset)));
        setOpen(false);
      }} onClose={() => setOpen(false)} />}
  </fieldset>;
}
