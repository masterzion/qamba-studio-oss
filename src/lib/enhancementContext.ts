import type { Asset, BibleAsset, BibleEntry } from "./db/types.ts";

const normalized = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export function enhancementContext(prompt: string, entries: BibleEntry[], links: BibleAsset[], attached: Asset[], assets: Asset[]) {
  const ids = new Set(attached.map((a) => a.id));
  const text = normalized(prompt);
  const relevant = entries.filter((e) => (e.name.trim() && text.includes(normalized(e.name))) || links.some((l) => l.entry_id === e.id && ids.has(l.asset_id)));
  const entryIds = new Set(relevant.map((e) => e.id));
  const linkedIds = new Set(links.filter((l) => entryIds.has(l.entry_id)).map((l) => l.asset_id));
  const images = [...new Map([...attached, ...assets.filter((a) => linkedIds.has(a.id))]
    .filter((a) => a.kind === "image").map((a) => [a.id, a])).values()];
  return {
    profiles: relevant.map((e) => ({ name: e.name, kind: e.kind, summary: e.summary, identity: e.identity_line, profile: e.doc })),
    images,
  };
}

/** Keep analysis images small; the generation still uses original assets. */
export async function enhancementImage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not read reference image (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare reference image");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally { URL.revokeObjectURL(objectUrl); }
}
