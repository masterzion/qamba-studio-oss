export interface LocalProviderProfile {
  id: string;
  role: "text" | "vision" | "embedding" | "tts";
  protocol: "ollama" | "openai-compatible" | "qamba-tts-v1";
  baseUrl: string;
  modelId: string;
  capabilities: string[];
  timeoutMs: number;
}
const KEY = "qamba.local-provider-profiles.v1";
const TEXT_PROVIDER_KEY = "qamba.local-text-provider.v1";
export function selectLocalTextProvider(provider: "ollama" | "lm-studio") {
  localStorage.setItem(TEXT_PROVIDER_KEY, provider);
}
export function selectedLocalTextProvider(): "ollama" | "lm-studio" {
  const selected = localStorage.getItem(TEXT_PROVIDER_KEY);
  return selected === "lm-studio" ||
    (!selected &&
      loadLocalProfiles().find((p) => p.role === "text")?.protocol ===
        "openai-compatible")
    ? "lm-studio"
    : "ollama";
}
export function validateLocalEndpoint(value: string): string {
  const u = new URL(value);
  const h = u.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    !(
      h === "localhost" ||
      h === "[::1]" ||
      /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(h)
    )
  )
    throw new Error(
      "Use a loopback HTTP endpoint without credentials, query or fragment",
    );
  return u.toString().replace(/\/$/, "");
}
export function loadLocalProfiles(): LocalProviderProfile[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function saveLocalProfiles(profiles: LocalProviderProfile[]): void {
  const ids = new Set<string>();
  for (const p of profiles) {
    validateLocalEndpoint(p.baseUrl);
    if (
      ids.has(p.id) ||
      !p.modelId.trim() ||
      p.timeoutMs < 1000 ||
      p.timeoutMs > 300000
    )
      throw new Error(
        "Profiles require unique IDs, a model and a 1–300 second timeout",
      );
    ids.add(p.id);
  }
  localStorage.setItem(KEY, JSON.stringify(profiles));
}
export function localProfileFor(role: LocalProviderProfile["role"]) {
  if (role === "text") {
    const selected = selectedLocalTextProvider();
    return loadLocalProfiles().find(
      (p) =>
        p.role === role &&
        p.protocol ===
          (selected === "lm-studio" ? "openai-compatible" : "ollama"),
    );
  }
  return loadLocalProfiles().find((p) => p.role === role);
}
