export function localChatMessages(messages: unknown[], protocol: string): unknown[] {
  return messages.map((value) => {
    const m = value as Record<string, unknown>;
    if (protocol !== "openai-compatible" || !Array.isArray(m.images) || !m.images.length) return m;
    const { images, ...rest } = m;
    return { ...rest, content: [{ type: "text", text: String(m.content ?? "") },
      ...images.map((data) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${data}` } }))] };
  });
}

export function localChatText(content: unknown): string {
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.filter((p) => p?.type === "text").map((p) => p.text ?? "").join("") : "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
