import React from "react";
import SceneContentEditor from "./SceneContentEditor";
import { changeSceneTransition } from "../../lib/storyAuthoring";
import { editLocalizedText } from "../../lib/storyLocalization";
import ConditionEditor from "./ConditionEditor";
import EffectEditor from "./EffectEditor";
import CitationEditor from "./CitationEditor";
import StoryAssetPicker from "./StoryAssetPicker";
import { storyStore } from "../../lib/db/storyGraphs";
import type { GraphDocument, StoryNode, StoryEdge } from "../../lib/storyTypes";
import StorySoundtrackPicker from "./StorySoundtrackPicker";
export default function StoryInspector({
  document,
  selectedId,
  onChange,
  timelinePicker,
  projectId,
  language = document.defaultLanguage,
}: {
  document: GraphDocument;
  selectedId: string | null;
  onChange: (d: GraphDocument, reason?: string) => void;
  timelinePicker?: React.ReactNode;
  projectId: string;
  language?: string;
}) {
  const node = document.nodes.find((n) => n.id === selectedId),
    edge = document.edges.find((e) => e.id === selectedId);
  const readText = (value: any) =>
    typeof value === "string" ? value : (value?.[language] ?? "");
  const writeText = (value: any, text: string) =>
    editLocalizedText(value, language, text, document.schemaVersion);
  const patch = (p: Partial<StoryNode>) =>
    onChange({
      ...document,
      nodes: document.nodes.map((n) =>
        n.id === node?.id ? { ...n, ...p } : n,
      ),
    });
  const patchEdge = (p: Partial<StoryEdge>) =>
    onChange({
      ...document,
      edges: document.edges.map((e) =>
        e.id === edge?.id ? { ...e, ...p } : e,
      ),
    });
  if (edge)
    return (
      <section className="story-panel">
        <h3>Transition</h3>
        <input
          aria-label="Branch label"
          value={edge.label}
          onChange={(e) => patchEdge({ label: e.target.value })}
        />
        <ConditionEditor
          value={edge.condition}
          definitions={document.stateDefinitions}
          onChange={(condition) => patchEdge({ condition })}
        />
        <EffectEditor
          value={edge.effects}
          definitions={document.stateDefinitions}
          onChange={(effects) => patchEdge({ effects })}
        />
        <button
          onClick={() =>
            onChange({
              ...document,
              edges: document.edges.filter((e) => e.id !== edge.id),
            })
          }
        >
          Disconnect edge
        </button>
      </section>
    );
  if (!node) return <p>Select a node or edge to edit it.</p>;
  return (
    <section className="story-panel">
      <h3>{node.type.replace("_", " ")}</h3>
      {node.type === "scene" && timelinePicker}
      {node.type === "base_sound_track" && (
        <StorySoundtrackPicker key={node.id} projectId={projectId} paths={node.soundtrackPaths ?? []}
          onChange={(soundtrackPaths) => patch({ soundtrackPaths })} />
      )}
      <label>
        Title
        <input
          value={
            typeof node.title === "string"
              ? node.title
              : (node.title[language] ?? "")
          }
          onChange={(e) =>
            patch({
              title:
                document.schemaVersion === 2
                  ? {
                      ...(typeof node.title === "object" ? node.title : {}),
                      [language]: e.target.value,
                    }
                  : e.target.value,
            })
          }
        />
      </label>
      {document.schemaVersion === 1 && (
        <button onClick={() => onChange({ ...document, entryNodeId: node.id })}>
          Set as entry
        </button>
      )}
      {node.type === "scene" && node.content && (
        <>
          <SceneContentEditor
            projectId={projectId}
            value={node.content}
            language={language}
            onChange={(content) => patch({ content })}
          />
          <label>
            Scene transition
            <select
              aria-label="Scene transition"
              value={node.content.transitionMode}
              onChange={(e) => {
                const transitionMode = e.target.value as "choice" | "continue";
                const outgoing = document.edges.filter(
                  (edge) => edge.sourceNodeId === node.id,
                );
                let retain: string | undefined;
                if (
                  outgoing.length &&
                  !window.confirm(
                    transitionMode === "choice"
                      ? "Keep the current destination as the first choice?"
                      : "Keep one branch as Continue and remove the other choices?",
                  )
                )
                  return;
                if (transitionMode === "continue" && outgoing.length > 1) {
                  const input = window.prompt(
                    "Which connected branch should remain? Enter its number:\n" +
                      outgoing
                        .map((edge, i) => `${i + 1}: ${edge.sourcePort}`)
                        .join("\n"),
                  );
                  if (!input) return;
                  retain = outgoing[Number(input) - 1]?.sourcePort;
                  if (!retain) return;
                }
                onChange(
                  changeSceneTransition(
                    document,
                    node.id,
                    transitionMode,
                    retain,
                  ),
                );
              }}
            >
              <option value="continue">Continue</option>
              <option value="choice">Decision with choices</option>
            </select>
          </label>
        </>
      )}
      <CitationEditor
        projectId={projectId}
        value={node.sourceRefs}
        onChange={(sourceRefs) => patch({ sourceRefs })}
      />
      {node.type === "historical_event" && (
        <>
          <label>
            Historical record
            <select
              value={node.historicalEntryId}
              onChange={(e) => patch({ historicalEntryId: e.target.value })}
            >
              {storyStore(projectId)
                .rows("bible_entries")
                .filter((e) => e.doc?.historical)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.doc.historical.classification} ·{" "}
                    {e.doc.historical.review.status}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Educational explanation
            <textarea
              value={readText(node.explanation)}
              onChange={(e) =>
                patch({
                  explanation: writeText(node.explanation, e.target.value),
                })
              }
            />
          </label>
        </>
      )}
      {node.type === "scene" && (
        <>
          <StoryAssetPicker
            projectId={projectId}
            label="Scene poster"
            value={node.presentation?.posterAssetId ?? null}
            onChange={(posterAssetId) =>
              patch({
                presentation: {
                  subtitleAssetId: node.presentation?.subtitleAssetId ?? null,
                  posterAssetId,
                },
              })
            }
          />
          <StoryAssetPicker
            projectId={projectId}
            label="Scene subtitles"
            subtitles
            value={node.presentation?.subtitleAssetId ?? null}
            onChange={(subtitleAssetId) =>
              patch({
                presentation: {
                  posterAssetId: node.presentation?.posterAssetId ?? null,
                  subtitleAssetId,
                },
              })
            }
          />
        </>
      )}
      {(node.type === "decision" ||
        node.content?.transitionMode === "choice") && (
        <>
          {node.type === "decision" && (
            <label>
              Prompt
              <textarea
                value={readText(node.prompt)}
                onChange={(e) =>
                  patch({ prompt: writeText(node.prompt, e.target.value) })
                }
              />
            </label>
          )}
          <fieldset>
            <legend>Choice timer</legend>
            <label>
              <input type="checkbox" checked={node.choiceTimer?.enabled ?? false}
                onChange={(e) => patch({ choiceTimer: {
                  enabled: e.target.checked, durationMs: node.choiceTimer?.durationMs ?? 10000,
                } })} />
              Enable choice timer
            </label>
            <label>
              Time to choose (milliseconds)
              <input type="number" min={1} step={1}
                disabled={!node.choiceTimer?.enabled}
                value={node.choiceTimer?.durationMs ?? 10000}
                onChange={(e) => {
                  const durationMs = Number(e.target.value);
                  if (Number.isSafeInteger(durationMs) && durationMs > 0)
                    patch({ choiceTimer: { enabled: node.choiceTimer?.enabled ?? false, durationMs } });
                }} />
            </label>
          </fieldset>
          {node.choices?.map((c, i) => (
            <fieldset key={c.id}>
              <legend>Choice {i + 1}</legend>
              <StoryAssetPicker
                projectId={projectId}
                label="Choice icon"
                value={c.iconAssetId}
                onChange={(iconAssetId) =>
                  patch({
                    choices: node.choices!.map((v) =>
                      v.id === c.id ? { ...v, iconAssetId } : v,
                    ),
                  })
                }
              />
              <CitationEditor
                projectId={projectId}
                value={c.sourceRefs}
                onChange={(sourceRefs) =>
                  patch({
                    choices: node.choices!.map((v) =>
                      v.id === c.id ? { ...v, sourceRefs } : v,
                    ),
                  })
                }
              />
              <input
                aria-label="Choice label"
                value={
                  typeof c.label === "string"
                    ? c.label
                    : (c.label[language] ?? "")
                }
                onChange={(e) =>
                  patch({
                    choices: node.choices!.map((v) =>
                      v.id === c.id
                        ? {
                            ...v,
                            label:
                              document.schemaVersion === 2
                                ? {
                                    ...(typeof v.label === "object"
                                      ? v.label
                                      : {}),
                                    [language]: e.target.value,
                                  }
                                : e.target.value,
                          }
                        : v,
                    ),
                  })
                }
              />
              <ConditionEditor
                value={c.condition}
                definitions={document.stateDefinitions}
                onChange={(condition) =>
                  patch({
                    choices: node.choices!.map((v) =>
                      v.id === c.id ? { ...v, condition } : v,
                    ),
                  })
                }
              />
              <EffectEditor
                value={c.effects}
                definitions={document.stateDefinitions}
                onChange={(effects) =>
                  patch({
                    choices: node.choices!.map((v) =>
                      v.id === c.id ? { ...v, effects } : v,
                    ),
                  })
                }
              />
              <label>
                Historical annotation
                <textarea
                  value={readText(c.historicalAnnotation)}
                  onChange={(e) =>
                    patch({
                      choices: node.choices!.map((v) =>
                        v.id === c.id
                          ? {
                              ...v,
                              historicalAnnotation: writeText(
                                v.historicalAnnotation,
                                e.target.value,
                              ),
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Educational explanation
                <textarea
                  value={readText(c.educationalExplanation)}
                  onChange={(e) =>
                    patch({
                      choices: node.choices!.map((v) =>
                        v.id === c.id
                          ? {
                              ...v,
                              educationalExplanation: writeText(
                                v.educationalExplanation,
                                e.target.value,
                              ),
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                disabled={i === 0}
                onClick={() => {
                  const choices = [...node.choices!];
                  [choices[i - 1], choices[i]] = [choices[i], choices[i - 1]];
                  patch({ choices });
                }}
              >
                Move choice up
              </button>
              <button
                disabled={i === node.choices!.length - 1}
                onClick={() => {
                  const choices = [...node.choices!];
                  [choices[i + 1], choices[i]] = [choices[i], choices[i + 1]];
                  patch({ choices });
                }}
              >
                Move choice down
              </button>
              <button
                onClick={() =>
                  onChange({
                    ...document,
                    nodes: document.nodes.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            choices: node.choices!.filter((v) => v.id !== c.id),
                          }
                        : n,
                    ),
                    edges: document.edges.filter(
                      (e) =>
                        !(e.sourceNodeId === node.id && e.sourcePort === c.id),
                    ),
                  })
                }
              >
                Remove choice
              </button>
            </fieldset>
          ))}
          <button
            onClick={() =>
              patch({
                choices: [
                  ...(node.choices ?? []),
                  {
                    id: crypto.randomUUID(),
                    label:
                      document.schemaVersion === 2
                        ? { [language]: "New choice" }
                        : "New choice",
                    condition: null,
                    effects: [],
                    sourceRefs: [],
                    tags: [],
                    iconAssetId: null,
                    historicalAnnotation:
                      document.schemaVersion === 2 ? {} : "",
                    educationalExplanation:
                      document.schemaVersion === 2 ? {} : "",
                  },
                ],
              })
            }
          >
            Add choice
          </button>
        </>
      )}
      {node.type === "conditional" && (
        <>
          {node.cases?.map((c) => (
            <fieldset key={c.id}>
              <input
                aria-label="Case label"
                value={readText(c.label)}
                onChange={(e) =>
                  patch({
                    cases: node.cases!.map((v) =>
                      v.id === c.id
                        ? { ...v, label: writeText(v.label, e.target.value) }
                        : v,
                    ),
                  })
                }
              />
              <ConditionEditor
                value={c.condition}
                definitions={document.stateDefinitions}
                onChange={(condition) =>
                  patch({
                    cases: node.cases!.map((v) =>
                      v.id === c.id ? { ...v, condition } : v,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  onChange({
                    ...document,
                    nodes: document.nodes.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            cases: node.cases!.filter((v) => v.id !== c.id),
                          }
                        : n,
                    ),
                    edges: document.edges.filter(
                      (e) =>
                        e.sourceNodeId !== node.id || e.sourcePort !== c.id,
                    ),
                  })
                }
              >
                Remove case and edge
              </button>
            </fieldset>
          ))}
          <button
            onClick={() =>
              patch({
                cases: [
                  ...(node.cases ?? []),
                  {
                    id: crypto.randomUUID(),
                    label: writeText(undefined, "New case"),
                    condition: {
                      path: Object.keys(document.stateDefinitions.paths)[0],
                      operator: "exists",
                    },
                  },
                ],
              })
            }
          >
            Add case
          </button>
        </>
      )}
      {node.type === "ending" && (
        <>
          {[
            "classification",
            "historicalExplanation",
            "educationalSummary",
          ].map((key) => (
            <label key={key}>
              {key}
              <textarea
                value={readText((node as any)[key])}
                onChange={(e) =>
                  patch({
                    [key]:
                      key === "classification"
                        ? e.target.value
                        : writeText((node as any)[key], e.target.value),
                  })
                }
              />
            </label>
          ))}
          {[
            "survival",
            "freedom",
            "family",
            "trust",
            "historicalImpact",
            "knowledge",
            "relationships",
          ].map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                value={Number(node.outcomes?.[key] ?? 0)}
                onChange={(e) =>
                  patch({
                    outcomes: {
                      ...node.outcomes,
                      [key]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </>
      )}
      {node.type !== "start" && (
        <>
          <h4>Entry condition</h4>
          <ConditionEditor
            value={node.condition}
            definitions={document.stateDefinitions}
            onChange={(condition) => patch({ condition })}
          />
          <EffectEditor
            value={node.enterEffects}
            definitions={document.stateDefinitions}
            onChange={(enterEffects) => patch({ enterEffects })}
          />
        </>
      )}
      <button
        disabled={node.type === "start"}
        onClick={() =>
          onChange({
            ...document,
            nodes: document.nodes.filter((n) => n.id !== node.id),
            edges: document.edges.filter(
              (e) => e.sourceNodeId !== node.id && e.targetNodeId !== node.id,
            ),
            entryNodeId:
              document.entryNodeId === node.id
                ? (document.nodes.find((n) => n.id !== node.id)?.id ??
                  document.entryNodeId)
                : document.entryNodeId,
          })
        }
      >
        Delete node (keeps scene)
      </button>
    </section>
  );
}
