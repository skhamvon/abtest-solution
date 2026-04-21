import type { SegmentRule } from "@abtest-solution/core";
import type { Path } from "@/lib/segmentEditorModel";

export function LeafRuleForm({
  rule,
  path,
  onChange,
}: {
  rule: SegmentRule;
  path: Path;
  onChange: (path: Path, next: SegmentRule) => void;
}) {
  const update = (next: SegmentRule) => onChange(path, next);

  switch (rule.type) {
    case "country":
    case "region":
    case "browser":
    case "browserLanguage": {
      const valuesStr = rule.values.join(", ");
      return (
        <label className="segment-editor__mini-field">
          <span>Valeurs (séparées par des virgules)</span>
          <input
            className="field-input"
            value={valuesStr}
            onChange={(e) => {
              const values = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (values.length === 0) return;
              update({ ...rule, values } as SegmentRule);
            }}
          />
        </label>
      );
    }
    case "device": {
      const kinds = ["desktop", "mobile", "tablet"] as const;
      return (
        <fieldset className="segment-editor__mini-field">
          <legend>Appareils</legend>
          <div className="segment-editor__checks">
            {kinds.map((k) => (
              <label key={k} className="segment-editor__check">
                <input
                  type="checkbox"
                  checked={rule.values.includes(k)}
                  onChange={() => {
                    const has = rule.values.includes(k);
                    const nextVals = has
                      ? rule.values.filter((v) => v !== k)
                      : [...rule.values, k];
                    if (nextVals.length === 0) return;
                    update({ ...rule, values: nextVals });
                  }}
                />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "loggedIn":
      return (
        <label className="segment-editor__mini-field">
          <span>Connecté</span>
          <select
            className="field-input"
            value={rule.value ? "true" : "false"}
            onChange={(e) =>
              update({
                ...rule,
                value: e.target.value === "true",
              })
            }
          >
            <option value="true">oui</option>
            <option value="false">non</option>
          </select>
        </label>
      );
    case "url": {
      const ops = [
        "equals",
        "contains",
        "startsWith",
        "endsWith",
        "matchesRegex",
      ] as const;
      return (
        <>
          <label className="segment-editor__mini-field">
            <span>Opérateur</span>
            <select
              className="field-input"
              value={rule.operator}
              onChange={(e) =>
                update({
                  ...rule,
                  operator: e.target.value as (typeof ops)[number],
                })
              }
            >
              {ops.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="segment-editor__mini-field">
            <span>Valeur</span>
            <input
              className="field-input"
              value={rule.value}
              onChange={(e) => update({ ...rule, value: e.target.value })}
            />
          </label>
          <label className="segment-editor__mini-field segment-editor__check">
            <input
              type="checkbox"
              checked={rule.ignoreQueryString === true}
              onChange={(e) =>
                update({ ...rule, ignoreQueryString: e.target.checked })
              }
            />
            Ignorer query string
          </label>
        </>
      );
    }
    case "queryParam": {
      if (rule.operator === "exists") {
        return (
          <label className="segment-editor__mini-field">
            <span>Nom du paramètre</span>
            <input
              className="field-input"
              value={rule.name}
              onChange={(e) => update({ ...rule, name: e.target.value })}
            />
          </label>
        );
      }
      const op = rule.operator;
      return (
        <>
          <label className="segment-editor__mini-field">
            <span>Nom</span>
            <input
              className="field-input"
              value={rule.name}
              onChange={(e) => update({ ...rule, name: e.target.value })}
            />
          </label>
          <label className="segment-editor__mini-field">
            <span>Opérateur</span>
            <select
              className="field-input"
              value={op}
              onChange={(e) => {
                const o = e.target.value;
                if (o === "exists") {
                  update({
                    type: "queryParam",
                    name: rule.name,
                    operator: "exists",
                  });
                } else if (o === "equals") {
                  update({
                    type: "queryParam",
                    name: rule.name,
                    operator: "equals",
                    value: "",
                  });
                } else if (o === "contains") {
                  update({
                    type: "queryParam",
                    name: rule.name,
                    operator: "contains",
                    value: "x",
                  });
                } else {
                  update({
                    type: "queryParam",
                    name: rule.name,
                    operator: "matchesRegex",
                    value: ".*",
                  });
                }
              }}
            >
              <option value="equals">equals</option>
              <option value="contains">contains</option>
              <option value="matchesRegex">matchesRegex</option>
              <option value="exists">exists</option>
            </select>
          </label>
          <label className="segment-editor__mini-field">
            <span>Valeur</span>
            <input
              className="field-input"
              value={"value" in rule ? rule.value : ""}
              onChange={(e) =>
                update({
                  ...rule,
                  value: e.target.value,
                } as SegmentRule)
              }
            />
          </label>
        </>
      );
    }
    case "screen": {
      const ops = [
        "widthAtLeast",
        "widthAtMost",
        "heightAtLeast",
        "heightAtMost",
      ] as const;
      return (
        <>
          <label className="segment-editor__mini-field">
            <span>Opérateur</span>
            <select
              className="field-input"
              value={rule.operator}
              onChange={(e) =>
                update({
                  ...rule,
                  operator: e.target.value as (typeof ops)[number],
                })
              }
            >
              {ops.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="segment-editor__mini-field">
            <span>Valeur (px)</span>
            <input
              className="field-input"
              type="number"
              value={rule.value}
              onChange={(e) =>
                update({ ...rule, value: Number(e.target.value) || 0 })
              }
            />
          </label>
        </>
      );
    }
    case "city": {
      if (rule.operator === "contains") {
        return (
          <label className="segment-editor__mini-field">
            <span>Sous-chaîne</span>
            <input
              className="field-input"
              value={rule.value}
              onChange={(e) => update({ ...rule, value: e.target.value })}
            />
          </label>
        );
      }
      const valuesStr = rule.values.join(", ");
      return (
        <label className="segment-editor__mini-field">
          <span>Villes (virgules)</span>
          <input
            className="field-input"
            value={valuesStr}
            onChange={(e) => {
              const values = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (values.length === 0) return;
              update({ ...rule, values });
            }}
          />
        </label>
      );
    }
    case "browserVersion": {
      const ops = ["equals", "olderThan", "newerThan"] as const;
      return (
        <>
          <label className="segment-editor__mini-field">
            <span>Opérateur</span>
            <select
              className="field-input"
              value={rule.operator}
              onChange={(e) =>
                update({
                  ...rule,
                  operator: e.target.value as (typeof ops)[number],
                })
              }
            >
              {ops.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="segment-editor__mini-field">
            <span>Version</span>
            <input
              className="field-input"
              value={rule.value}
              onChange={(e) => update({ ...rule, value: e.target.value })}
            />
          </label>
        </>
      );
    }
    case "customRule":
      return (
        <label className="segment-editor__mini-field">
          <span>ruleId</span>
          <input
            className="field-input"
            value={rule.ruleId}
            onChange={(e) => update({ ...rule, ruleId: e.target.value })}
          />
        </label>
      );
    case "dom":
      return (
        <label className="segment-editor__mini-field">
          <span>presenceKey</span>
          <input
            className="field-input"
            value={rule.presenceKey}
            onChange={(e) => update({ ...rule, presenceKey: e.target.value })}
          />
        </label>
      );
    case "cookie": {
      if (rule.operator === "exists") {
        return (
          <label className="segment-editor__mini-field">
            <span>Nom du cookie</span>
            <input
              className="field-input"
              value={rule.name}
              onChange={(e) => update({ ...rule, name: e.target.value })}
            />
          </label>
        );
      }
      return (
        <>
          <label className="segment-editor__mini-field">
            <span>Nom</span>
            <input
              className="field-input"
              value={rule.name}
              onChange={(e) => update({ ...rule, name: e.target.value })}
            />
          </label>
          <label className="segment-editor__mini-field">
            <span>Opérateur</span>
            <select
              className="field-input"
              value={rule.operator}
              onChange={(e) => {
                const o = e.target.value;
                if (o === "exists") {
                  update({
                    type: "cookie",
                    name: rule.name,
                    operator: "exists",
                  });
                } else if (o === "equals") {
                  update({
                    type: "cookie",
                    name: rule.name,
                    operator: "equals",
                    value: "",
                  });
                } else {
                  update({
                    type: "cookie",
                    name: rule.name,
                    operator: "contains",
                    value: "x",
                  });
                }
              }}
            >
              <option value="exists">exists</option>
              <option value="equals">equals</option>
              <option value="contains">contains</option>
            </select>
          </label>
          <label className="segment-editor__mini-field">
            <span>Valeur</span>
            <input
              className="field-input"
              value={"value" in rule ? rule.value : ""}
              onChange={(e) =>
                update({
                  ...rule,
                  value: e.target.value,
                } as SegmentRule)
              }
            />
          </label>
        </>
      );
    }
    case "visitorType":
      return (
        <label className="segment-editor__mini-field">
          <span>Type</span>
          <select
            className="field-input"
            value={rule.value}
            onChange={(e) =>
              update({
                ...rule,
                value: e.target.value as "new" | "returning",
              })
            }
          >
            <option value="new">new</option>
            <option value="returning">returning</option>
          </select>
        </label>
      );
    default: {
      const _e: never = rule;
      return _e;
    }
  }
}

