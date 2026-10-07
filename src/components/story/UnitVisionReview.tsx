import React, { useState } from "react";
import type { LocalStore } from "../../lib/localStore";
import { localProfileFor } from "../../lib/localProviderProfiles";
import { assetUrl } from "../../lib/db/assets";
import { invokeStrict } from "../../lib/desktop";
export default function UnitVisionReview({
  store,
  unitId,
}: {
  store: LocalStore;
  unitId: string;
}) {
  const [assetId, setAssetId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <fieldset>
      <legend>Optional local visual advisory</legend>
      <label>
        Keyframe candidate
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">Choose image…</option>
          {store
            .rows("assets")
            .filter((a) => ["image", "frame"].includes(a.kind) && !a.deleted_at)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.b2_key}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={busy || !assetId}
        onClick={async () => {
          setBusy(true);
          try {
            const profile = localProfileFor("vision"),
              asset = store.find("assets", assetId),
              unit = store.find("production_units", unitId);
            if (!profile?.capabilities.includes("vision") || !asset || !unit)
              throw new Error(
                "Configure a provisioned local vision profile with the vision capability",
              );
            const url = assetUrl(asset as any);
            if (!url) throw new Error("Candidate media is unavailable");
            const parsed = new URL(url);
            if (
              !["asset:"].includes(parsed.protocol) &&
              !["127.0.0.1", "localhost", "asset.localhost", "[::1]"].includes(
                parsed.hostname,
              )
            )
              throw new Error("Advisory review only reads local project media");
            const response = await fetch(url);
            if (!response.ok) throw new Error("Cannot read candidate media");
            const blob = await response.blob();
            if (blob.size > 8 * 1024 * 1024)
              throw new Error("Use a review proxy no larger than 8 MiB");
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const proof: any = await invokeStrict("story_media_probe", {
              projectId: store.projectId,
              key: asset.b2_key,
            });
            const text =
              "Provide advisory visual QA only. Do not approve media or invent historical facts. Check identity, costume, injury, number of characters/props, placement, anatomy, environment and action. Identify uncertainty. Captured requirements: " +
              JSON.stringify(unit.context).slice(0, 12000);
            const messages =
              profile.protocol === "ollama"
                ? [
                    {
                      role: "user",
                      content: text,
                      images: [dataUrl.split(",")[1]],
                    },
                  ]
                : [
                    {
                      role: "user",
                      content: [
                        { type: "text", text },
                        { type: "image_url", image_url: { url: dataUrl } },
                      ],
                    },
                  ];
            const result: any = await invokeStrict("local_provider_chat", {
              profile,
              body: { messages, max_tokens: 800, temperature: 0 },
            });
            const report =
              result.message?.content ?? result.choices?.[0]?.message?.content;
            if (typeof report !== "string")
              throw new Error(
                "Local vision model did not return an advisory report",
              );
            const project = store.find("projects", store.projectId)!;
            store.update("projects", [project], {
              settings: {
                ...project.settings,
                qa_reports: [
                  ...(project.settings?.qa_reports ?? []).slice(-19),
                  {
                    unitId,
                    assetId,
                    mediaHash: proof.sha256,
                    profileId: profile.id,
                    model: profile.modelId,
                    promptVersion: "story-visual-qa-v1",
                    createdAt: new Date().toISOString(),
                    report: report.slice(0, 20000),
                  },
                ],
              },
            });
            setMessage(report);
          } catch (e: any) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Request advisory report
      </button>
      <p>
        Human visual approval remains required. This report does not approve the
        candidate.
      </p>
      <pre role="status">{message}</pre>
    </fieldset>
  );
}
