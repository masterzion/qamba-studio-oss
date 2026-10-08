import test from "node:test";
import assert from "node:assert/strict";
import { localChatMessages, localChatText } from "./localChatWire.ts";

test("LM Studio receives real vision content rather than Ollama's images field", () => {
  const messages = [{ role: "user", content: "Inspect this character", images: ["abc"] }];
  assert.deepEqual(localChatMessages(messages, "openai-compatible"), [{ role: "user", content: [
    { type: "text", text: "Inspect this character" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc" } },
  ] }]);
  assert.deepEqual(localChatMessages(messages, "ollama"), messages);
});

test("only final text reaches the prompt box, including multipart responses", () => {
  assert.equal(localChatText("<think>internal reasoning</think>Finished video prompt"), "Finished video prompt");
  assert.equal(localChatText([{ type: "reasoning", text: "analysis" }, { type: "text", text: "Final prompt" }]), "Final prompt");
  assert.equal(localChatText(null), "");
});
