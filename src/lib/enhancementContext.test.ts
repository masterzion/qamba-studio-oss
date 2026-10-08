import test from "node:test";
import assert from "node:assert/strict";
import { enhancementContext } from "./enhancementContext.ts";
import type { Asset, BibleEntry, BibleAsset } from "./db/types.ts";

test("enhancement includes mentioned character identity, full profile and linked pictures", () => {
  const entry = { id: "character", name: "Elīna Ozoliņa", kind: "character", identity_line: "Latvian investigator", doc: { age: 34, voice: "calm" }, summary: "Physicist" } as BibleEntry;
  const image = { id: "face", kind: "image" } as Asset;
  const audio = { id: "voice", kind: "audio" } as Asset;
  const links = [{ entry_id: entry.id, asset_id: image.id }, { entry_id: entry.id, asset_id: audio.id }] as BibleAsset[];
  const context = enhancementContext("Elina Ozolina walks outside", [entry], links, [image], [image, audio]);
  assert.deepEqual(context.profiles[0].profile, entry.doc);
  assert.equal(context.profiles[0].identity, entry.identity_line);
  assert.deepEqual(context.images, [image]);
});

test("attached character reference resolves its profile even without a name in the prompt", () => {
  const entry = { id: "character", name: "Elina", kind: "character", doc: { look: "coat" } } as BibleEntry;
  const image = { id: "face", kind: "image" } as Asset;
  const unrelated = { id: "other", name: "Other character", doc: {} } as BibleEntry;
  const context = enhancementContext("she walks", [entry, unrelated], [{ entry_id: entry.id, asset_id: image.id } as BibleAsset], [image], [image]);
  assert.equal(context.profiles.length, 1);
  assert.equal(context.profiles[0].name, "Elina");
});
