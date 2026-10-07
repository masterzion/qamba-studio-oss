import React, { useState } from "react";
import {
  loadLocalProfiles,
  saveLocalProfiles,
  type LocalProviderProfile,
} from "../../lib/localProviderProfiles";
export default function LocalProviderProfiles() {
  const [profiles, setProfiles] = useState(loadLocalProfiles),
    [message, setMessage] = useState("");
  const patch = (id: string, values: Partial<LocalProviderProfile>) =>
    setProfiles((p) => p.map((v) => (v.id === id ? { ...v, ...values } : v)));
  return (
    <section className="story-panel">
      <h2>Local provider profiles</h2>
      <p>
        Configure provisioned loopback servers. Tool and language capabilities
        must be verified against the selected model.
      </p>
      {profiles.map((p) => (
        <fieldset key={p.id}>
          <select
            aria-label="Provider role"
            value={p.role}
            onChange={(e) => patch(p.id, { role: e.target.value as any })}
          >
            {["text", "vision", "embedding", "tts"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            value={p.protocol}
            onChange={(e) => patch(p.id, { protocol: e.target.value as any })}
          >
            <option>ollama</option>
            <option>openai-compatible</option>
            <option>qamba-tts-v1</option>
          </select>
          <label>
            Base URL
            <input
              value={p.baseUrl}
              onChange={(e) => patch(p.id, { baseUrl: e.target.value })}
            />
          </label>
          <label>
            Exact model ID
            <input
              value={p.modelId}
              onChange={(e) => patch(p.id, { modelId: e.target.value })}
            />
          </label>
          <label>
            Capabilities (comma separated)
            <input
              value={p.capabilities.join(",")}
              onChange={(e) =>
                patch(p.id, {
                  capabilities: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Timeout (milliseconds)
            <input
              type="number"
              value={p.timeoutMs}
              onChange={(e) =>
                patch(p.id, { timeoutMs: Number(e.target.value) })
              }
            />
          </label>
          <button
            onClick={() => setProfiles((v) => v.filter((x) => x.id !== p.id))}
          >
            Remove profile
          </button>
        </fieldset>
      ))}
      <button
        onClick={() =>
          setProfiles((v) => [
            ...v,
            {
              id: crypto.randomUUID(),
              role: "text",
              protocol: "ollama",
              baseUrl: "http://127.0.0.1:11434",
              modelId: "",
              capabilities: [],
              timeoutMs: 120000,
            },
          ])
        }
      >
        Add profile
      </button>
      <button
        onClick={() => {
          try {
            saveLocalProfiles(profiles);
            setMessage("Local profiles saved");
          } catch (e: any) {
            setMessage(e.message);
          }
        }}
      >
        Save profiles
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
