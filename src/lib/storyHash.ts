import { canonicalJSON } from "../../director/story_runtime.js";
export async function storyHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJSON(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
