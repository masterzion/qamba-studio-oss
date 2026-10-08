import { useState } from "react";
import OllamaSection from "./OllamaSection";
import { invokeStrict } from "../../lib/desktop";
import {
  loadLocalProfiles,
  saveLocalProfiles,
  selectLocalTextProvider,
  selectedLocalTextProvider,
  saveLocalModelIds,
  loadLocalModelIds,
} from "../../lib/localProviderProfiles";

export default function LocalTextProviderSection() {
  const existing = loadLocalProfiles().find(
    (p) => p.role === "text" && p.protocol === "openai-compatible",
  );
  const [provider, setProvider] = useState(selectedLocalTextProvider);
  const [url, setUrl] = useState(
    existing?.baseUrl ?? "http://127.0.0.1:1234/v1",
  );
  const [model, setModel] = useState(existing?.modelId ?? "");
  const [models, setModels] = useState<string[]>(() => loadLocalModelIds(existing?.baseUrl ?? "http://127.0.0.1:1234/v1"));
  const [tools, setTools] = useState(
    existing?.capabilities.includes("tools") ?? false,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <label
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        Local text provider
        <select
          aria-label="Local text provider"
          className="ws-input"
          value={provider}
          onChange={(e) => {
            const selected = e.target.value as "ollama" | "lm-studio";
            setProvider(selected);
            setMessage("");
            if (selected === "ollama") selectLocalTextProvider(selected);
          }}
        >
          <option value="ollama">Ollama</option>
          <option value="lm-studio">LM Studio</option>
        </select>
      </label>
      {provider === "ollama" ? (
        <OllamaSection />
      ) : (
        <div
          className="ws-card"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <strong>LM Studio</strong>
          <p>
            Start LM Studio's local server and load a model. Save the selection
            below to use it for the director and local text jobs.
          </p>
          <label>
            Server URL
            <input
              className="ws-input"
              aria-label="LM Studio server URL"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setModels([]); setMessage(""); }}
            />
          </label>
          <button
            className="ws-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ids = await invokeStrict<string[]>(
                  "local_provider_models",
                  { baseUrl: url, protocol: "openai-compatible" },
                );
                setModels(ids);
                saveLocalModelIds(url, ids);
                if (!model && ids.length) setModel(ids[0]);
                setMessage(
                  ids.length
                    ? `Connected: ${ids.length} available model(s)`
                    : "Connected, but no model is available. Load a model in LM Studio.",
                );
              } catch (error: any) {
                setMessage(error.message ?? String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Check connection and list models
          </button>
          <label>
            Exact model ID
            <select
              className="ws-input"
              aria-label="LM Studio model ID"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">Select a model…</option>
              {model && !models.includes(model) && <option value={model}>{model} · saved model</option>}
              {models.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <details><summary>Enter a model ID manually</summary>
            <input className="ws-input" aria-label="Custom LM Studio model ID" value={model} onChange={(e) => setModel(e.target.value)} />
          </details>
          <label>
            <input
              type="checkbox"
              checked={tools}
              onChange={(e) => setTools(e.target.checked)}
            />{" "}
            This model supports tool calls (required for the director)
          </label>
          <button
            className="ws-primary"
            onClick={() => {
              try {
                const current = loadLocalProfiles().find(
                  (p) =>
                    p.role === "text" && p.protocol === "openai-compatible",
                );
                const profile = {
                  id: current?.id ?? crypto.randomUUID(),
                  role: "text" as const,
                  protocol: "openai-compatible" as const,
                  baseUrl: url,
                  modelId: model.trim(),
                  capabilities: tools ? ["tools"] : [],
                  timeoutMs: 120000,
                };
                saveLocalProfiles([
                  ...loadLocalProfiles().filter((p) => p.id !== profile.id),
                  profile,
                ]);
                selectLocalTextProvider("lm-studio");
                setMessage(`LM Studio selected: ${profile.modelId}`);
              } catch (error: any) {
                setMessage(error.message ?? String(error));
              }
            }}
          >
            Use LM Studio
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
