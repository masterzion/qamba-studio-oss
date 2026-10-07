import { test } from "node:test";
import assert from "node:assert/strict";
import { transferLocalMedia } from "./localMediaTransfer.ts";

test("binary upload preserves a multi-megabyte file across ordered chunks", async () => {
  const original = Uint8Array.from({ length: 2142581 }, (_, i) => i % 256);
  const chunks: Uint8Array[] = [];
  const progress: number[] = [];
  await transferLocalMedia(
    new Blob([original]),
    async (bytes, append) => {
      assert.equal(append, chunks.length > 0);
      assert.ok(bytes.length <= 256 * 1024);
      chunks.push(bytes);
    },
    (fraction) => progress.push(fraction),
  );
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(original));
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((p, i) => i === 0 || p > progress[i - 1]));
});

test("failed chunk stops upload without reporting completion", async () => {
  let calls = 0;
  const progress: number[] = [];
  await assert.rejects(
    transferLocalMedia(
      new Blob([new Uint8Array(600000)]),
      async () => {
        if (++calls === 2) throw new Error("disk full");
      },
      (p) => progress.push(p),
    ),
    /disk full/,
  );
  assert.equal(calls, 2);
  assert.equal(progress.length, 1);
  assert.ok(progress[0] < 1);
});

test("unanswered native write times out instead of hanging at zero", async () => {
  await assert.rejects(
    transferLocalMedia(
      new Blob(["image"]),
      () => new Promise(() => {}),
      undefined,
      5,
    ),
    /timed out/,
  );
});
