import type { LocalizedText } from "./storyTypes.ts";
export {
  resolveLocalizedText,
  resolveText,
} from "../../director/story_runtime.js";
export function canonicalStoryLanguages(
  defaultLanguage: string,
  additional: string[] = [],
) {
  const languages = Intl.getCanonicalLocales([
    defaultLanguage.trim(),
    ...additional.map((l) => l.trim()),
  ]);
  if (!languages.length || !defaultLanguage.trim())
    throw new Error("Choose a default story language");
  return { defaultLanguage: languages[0], languages };
}
export function editLocalizedText(
  value: string | LocalizedText | undefined,
  language: string,
  text: string,
  version: number,
) {
  return version === 2
    ? { ...(typeof value === "object" ? value : {}), [language]: text }
    : text;
}
