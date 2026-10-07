import React, { useState } from "react";
import type { StateDefinitions } from "../../lib/storyTypes";
export default function StateDefinitionsEditor({
  value,
  onChange,
}: {
  value: StateDefinitions;
  onChange: (d: StateDefinitions) => void;
}) {
  const [path, setPath] = useState("variables.trust");
  return (
    <fieldset>
      <legend>Initial state and declared paths</legend>
      {Object.entries(value.paths).map(([p, d]) => (
        <div className="story-field" key={p}>
          <span>{p}</span>
          {d.type === "number" &&
            (["min", "max"] as const).map((bound) => (
              <label key={bound}>
                {bound}
                <input
                  type="number"
                  aria-label={`${bound} ${p}`}
                  value={d[bound] ?? ""}
                  onChange={(e) => {
                    const next = { ...d };
                    if (e.target.value === "") delete next[bound];
                    else next[bound] = Number(e.target.value);
                    onChange({ paths: { ...value.paths, [p]: next } });
                  }}
                />
              </label>
            ))}
          {["set", "string"].includes(d.type) && (
            <label>
              Allowed values (comma separated)
              <input
                aria-label={`Allowed values ${p}`}
                value={d.values?.join(",") ?? ""}
                onChange={(e) => {
                  const next = { ...d };
                  if (e.target.value.trim())
                    next.values = e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean);
                  else delete next.values;
                  onChange({ paths: { ...value.paths, [p]: next } });
                }}
              />
            </label>
          )}
          <button
            onClick={() => {
              const paths = { ...value.paths };
              delete paths[p];
              onChange({ paths });
            }}
          >
            Remove declaration
          </button>
          <select
            aria-label={`Type ${p}`}
            value={d.type}
            onChange={(e) => {
              const type = e.target.value as any;
              onChange({
                paths: {
                  ...value.paths,
                  [p]: {
                    type,
                    default:
                      type === "number"
                        ? 0
                        : type === "boolean"
                          ? false
                          : type === "set"
                            ? []
                            : "",
                  },
                },
              });
            }}
          >
            {["number", "boolean", "string", "set"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {d.type === "boolean" ? (
            <select
              aria-label={`Default ${p}`}
              value={String(d.default)}
              onChange={(e) =>
                onChange({
                  paths: {
                    ...value.paths,
                    [p]: { ...d, default: e.target.value === "true" },
                  },
                })
              }
            >
              <option>true</option>
              <option>false</option>
            </select>
          ) : (
            <input
              aria-label={`Default ${p}`}
              value={
                Array.isArray(d.default)
                  ? d.default.join(",")
                  : String(d.default ?? "")
              }
              onChange={(e) =>
                onChange({
                  paths: {
                    ...value.paths,
                    [p]: {
                      ...d,
                      default:
                        d.type === "number"
                          ? Number(e.target.value)
                          : d.type === "set"
                            ? e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean)
                            : e.target.value,
                    },
                  },
                })
              }
            />
          )}
        </div>
      ))}
      <div className="story-field">
        <input
          aria-label="New state path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button
          onClick={() =>
            onChange({
              paths: { ...value.paths, [path]: { type: "number", default: 0 } },
            })
          }
        >
          Declare path
        </button>
      </div>
    </fieldset>
  );
}
