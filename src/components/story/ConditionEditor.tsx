import React from "react";
import type { Condition, StateDefinitions } from "../../lib/storyTypes";
export default function ConditionEditor({
  value,
  definitions,
  onChange,
  depth = 0,
}: {
  value: Condition;
  definitions: StateDefinitions;
  onChange: (c: Condition) => void;
  depth?: number;
}) {
  const paths = Object.keys(definitions.paths);
  const predicate = (): Condition => ({
    path: paths[0],
    operator: "eq",
    value: definitions.paths[paths[0]]?.default ?? true,
  });
  if (value === null)
    return <button onClick={() => onChange(predicate())}>Add condition</button>;
  if ("all" in value || "any" in value || "not" in value) {
    const key = "all" in value ? "all" : "any" in value ? "any" : "not";
    const children = key === "not" ? [(value as any).not] : (value as any)[key];
    return (
      <fieldset>
        <legend>{key.toUpperCase()}</legend>
        {children.map((c: Condition, i: number) => (
          <div key={i}>
            <ConditionEditor
              value={c}
              definitions={definitions}
              depth={depth + 1}
              onChange={(next) =>
                onChange(
                  key === "not"
                    ? { not: next ?? predicate() }
                    : ({
                        [key]: children.map((v: Condition, j: number) =>
                          j === i ? (next ?? predicate()) : v,
                        ),
                      } as Condition),
                )
              }
            />
            {children.length > 1 && (
              <button
                onClick={() =>
                  onChange({
                    [key]: children.filter((_: any, j: number) => j !== i),
                  } as Condition)
                }
              >
                Remove predicate
              </button>
            )}
          </div>
        ))}
        {key !== "not" && depth < 15 && (
          <button
            onClick={() =>
              onChange({ [key]: [...children, predicate()] } as Condition)
            }
          >
            Add predicate
          </button>
        )}
        <button onClick={() => onChange(null)}>Clear condition</button>
      </fieldset>
    );
  }
  const d = definitions.paths[value.path];
  return (
    <div className="story-field">
      <select
        aria-label="Condition path"
        value={value.path}
        onChange={(e) =>
          onChange({
            ...value,
            path: e.target.value,
            value: definitions.paths[e.target.value].default ?? true,
          })
        }
      >
        {paths.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select
        aria-label="Condition operator"
        value={value.operator}
        onChange={(e) => {
          const operator = e.target.value as any;
          onChange(
            operator === "exists" || operator === "notExists"
              ? { path: value.path, operator }
              : { ...value, operator, value: value.value ?? d?.default ?? "" },
          );
        }}
      >
        {[
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "contains",
          "notContains",
          "exists",
          "notExists",
        ].map((op) => (
          <option key={op}>{op}</option>
        ))}
      </select>
      {!["exists", "notExists"].includes(value.operator) &&
        (d?.type === "boolean" ? (
          <select
            aria-label="Condition value"
            value={String(value.value)}
            onChange={(e) =>
              onChange({ ...value, value: e.target.value === "true" })
            }
          >
            <option>true</option>
            <option>false</option>
          </select>
        ) : (
          <input
            aria-label="Condition value"
            type={d?.type === "number" ? "number" : "text"}
            value={String(value.value ?? "")}
            onChange={(e) =>
              onChange({
                ...value,
                value:
                  d?.type === "number"
                    ? Number(e.target.value)
                    : e.target.value,
              })
            }
          />
        ))}
      <button onClick={() => onChange(null)}>Clear</button>
      {depth < 15 &&
        ["all", "any", "not"].map((k) => (
          <button
            key={k}
            onClick={() =>
              onChange(
                k === "not"
                  ? { not: value }
                  : ({ [k]: [value, predicate()] } as Condition),
              )
            }
          >
            {k.toUpperCase()}
          </button>
        ))}
    </div>
  );
}
