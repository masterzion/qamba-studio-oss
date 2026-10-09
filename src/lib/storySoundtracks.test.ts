import test from "node:test";
import assert from "node:assert/strict";
import { addSoundtrackPaths } from "./storySoundtracks.ts";
import { setLocalMediaRoot } from "./localMediaPath.ts";

test("soundtrack picks append audio paths only, deduplicate, and preserve existing paths", () => {
  setLocalMediaRoot("D:/media");
  try {
    const paths = ["older/theme.wav"];
    const assets = [
      { kind: "audio", b2_key: "theme.wav" },
      { kind: "audio", b2_key: "theme.wav" },
      { kind: "video", b2_key: "scene.mp4" },
      { kind: "audio", b2_key: "deleted.wav", deleted_at: "2026-10-09" },
    ];
    assert.deepEqual(addSoundtrackPaths(paths, "project", assets), ["older/theme.wav", "D:/media/project/media/theme.wav"]);
    assert.deepEqual(paths, ["older/theme.wav"]);
    assert.equal(assets.length, 4);
  } finally { setLocalMediaRoot(null); }
});

test("soundtrack selection preserves library keys when no local media root exists", () => {
  assert.deepEqual(addSoundtrackPaths([], "project", [{ kind: "audio", b2_key: "music/theme.mp3" }]), ["music/theme.mp3"]);
});
