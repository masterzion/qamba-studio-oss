import React from "react";
import type { SceneContent, LocalizedText } from "../../lib/storyTypes";
import { storyStore } from "../../lib/db/storyGraphs";
export default function SceneContentEditor({
  value,
  language,
  onChange,
  projectId,
}: {
  value: SceneContent;
  language: string;
  onChange: (v: SceneContent) => void;
  projectId: string;
}) {
  const localized = (
    label: string,
    map: LocalizedText,
    change: (map: LocalizedText) => void,
  ) => (
    <label>
      {label} · {language}
      <textarea
        aria-label={`${label} · ${language}`}
        value={map[language] ?? ""}
        onChange={(e) => change({ ...map, [language]: e.target.value })}
      />
    </label>
  );
  const patchLine = (
    id: string,
    p: Partial<SceneContent["dialogue"][number]>,
  ) =>
    onChange({
      ...value,
      dialogue: value.dialogue.map((l) => (l.id === id ? { ...l, ...p } : l)),
    });
  return (
    <section aria-label="Scene content">
      {localized("Synopsis", value.synopsis, (synopsis) =>
        onChange({ ...value, synopsis }),
      )}
      {localized("Visual prompt", value.visualPrompt, (visualPrompt) =>
        onChange({ ...value, visualPrompt }),
      )}
      {localized("Decision prompt", value.decisionPrompt, (decisionPrompt) =>
        onChange({ ...value, decisionPrompt }),
      )}
      <h4>Dialogue and subtitles</h4>
      {value.dialogue.map((line, i) => (
        <fieldset key={line.id}>
          <legend>Line {i + 1}</legend>
          <label>
            Speaker
            <select
              value={line.speakerId ?? ""}
              onChange={(e) =>
                patchLine(line.id, { speakerId: e.target.value || null })
              }
            >
              <option value="">Narrator</option>
              {storyStore(projectId)
                .rows("bible_entries")
                .filter((e) => e.type === "character" || e.kind === "character")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          {localized("Exact dialogue", line.text, (text) =>
            patchLine(line.id, { text }),
          )}
          {localized("Delivery instruction", line.delivery, (delivery) =>
            patchLine(line.id, { delivery }),
          )}
          <label>
            Feeling
            <input
              value={line.emotion}
              onChange={(e) => patchLine(line.id, { emotion: e.target.value })}
            />
          </label>
          <label>
            Intensity
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={line.intensity}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0 && n <= 1) patchLine(line.id, { intensity: n });
              }}
            />
          </label>
          <label>
            Pace
            <input
              type="number"
              min={0.1}
              max={4}
              step={0.1}
              value={line.pace}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n > 0) patchLine(line.id, { pace: n });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={line.offscreen}
              onChange={(e) =>
                patchLine(line.id, { offscreen: e.target.checked })
              }
            />
            Offscreen
          </label>
          <button
            disabled={i === 0}
            onClick={() => {
              const dialogue = [...value.dialogue];
              [dialogue[i - 1], dialogue[i]] = [dialogue[i], dialogue[i - 1]];
              onChange({ ...value, dialogue });
            }}
          >
            Move line up
          </button>
          <button
            disabled={i === value.dialogue.length - 1}
            onClick={() => {
              const dialogue = [...value.dialogue];
              [dialogue[i + 1], dialogue[i]] = [dialogue[i], dialogue[i + 1]];
              onChange({ ...value, dialogue });
            }}
          >
            Move line down
          </button>
          <button
            onClick={() =>
              onChange({
                ...value,
                dialogue: value.dialogue.filter((l) => l.id !== line.id),
              })
            }
          >
            Remove dialogue line
          </button>
        </fieldset>
      ))}
      <button
        onClick={() =>
          onChange({
            ...value,
            dialogue: [
              ...value.dialogue,
              {
                id: crypto.randomUUID(),
                speakerId: null,
                text: { [language]: "" },
                delivery: {},
                emotion: "neutral",
                intensity: 0,
                pace: 1,
                offscreen: false,
              },
            ],
          })
        }
      >
        Add dialogue line
      </button>
      <p>
        Translations share line IDs and decision IDs. Blank translations remain
        drafts; playback uses exact language, base language, then the default.
      </p>
    </section>
  );
}
