import { lmStudioProfile, loadLocalModelIds } from "./localProviderProfiles.ts";
export const lmStudioBackendId = (model: string) => `lm-studio:${encodeURIComponent(model)}`;
export function lmStudioBackendModel(id: string | undefined) {
  if (!id?.startsWith("lm-studio:")) return null;
  try { return decodeURIComponent(id.slice("lm-studio:".length)) || null; } catch { return null; }
}
export const isLmStudioBackend = (id: string | undefined) => id === "lm-studio-local" || !!lmStudioBackendModel(id);
export function lmStudioModelBackends() {
  const profile = lmStudioProfile();
  const ids = loadLocalModelIds(profile?.baseUrl ?? "http://127.0.0.1:1234/v1");
  if (profile?.modelId && !ids.includes(profile.modelId)) ids.unshift(profile.modelId);
  return ids.map((model) => ({ id: lmStudioBackendId(model), tier: "local" as const,
    model, short: model, label: `${model} · LM Studio`, connection: "LM Studio",
    hint: model.startsWith("text-embedding-") ? "Embedding model — cannot answer a director chat." : "Runs this exact model on your LM Studio server." }));
}
