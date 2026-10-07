import React from "react";
import type { Effect, StateDefinitions } from "../../lib/storyTypes";
export default function EffectEditor({
  value,
  definitions,
  onChange,
}: {
  value: Effect[];
  definitions: StateDefinitions;
  onChange: (e: Effect[]) => void;
}) {
  const paths = Object.keys(definitions.paths);
  const patch = (i: number, p: Partial<Effect>) =>
    onChange(value.map((e, j) => (i === j ? { ...e, ...p } : e)));
  return (
    <fieldset>
      <legend>State effects (in order)</legend>
      {value.map((e, i) => {
        const d = definitions.paths[e.path];
        return (
          <div className="story-field" key={i}>
            <select
              aria-label="Effect operation"
              value={e.operation}
              onChange={(ev) => patch(i, { operation: ev.target.value as any })}
            >
              {["set", "increment", "decrement", "add", "remove"].map((op) => (
                <option key={op}>{op}</option>
              ))}
            </select>
            <select
              aria-label="Effect path"
              value={e.path}
              onChange={(ev) =>
                patch(i, {
                  path: ev.target.value,
                  value: definitions.paths[ev.target.value].default ?? "",
                })
              }
            >
              {paths.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {d?.type === "boolean" ? (
              <select
                aria-label="Effect value"
                value={String(e.value)}
                onChange={(ev) =>
                  patch(i, { value: ev.target.value === "true" })
                }
              >
                <option>true</option>
                <option>false</option>
              </select>
            ) : (
              <input
                aria-label="Effect value"
                value={
                  Array.isArray(e.value)
                    ? e.value.join(",")
                    : String(e.value ?? "")
                }
                type={d?.type === "number" ? "number" : "text"}
                onChange={(ev) =>
                  patch(i, {
                    value:
                      d?.type === "number"
                        ? Number(ev.target.value)
                        : d?.type === "set" && e.operation === "set"
                          ? ev.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : ev.target.value,
                  })
                }
              />
            )}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        );
      })}
      <button
        disabled={!paths.length}
        onClick={() =>
          onChange([
            ...value,
            {
              operation: "set",
              path: paths[0],
              value: definitions.paths[paths[0]]?.default ?? true,
            },
          ])
        }
      >
        Add effect
      </button>
    </fieldset>
  );
}
