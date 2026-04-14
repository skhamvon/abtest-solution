import type { SegmentConditionBreakdownNode } from "@abtest-solution/core";

function Pill({ ok }: { ok: boolean }) {
  return (
    <span
      className="diag-pill"
      title={ok ? "Correspond" : "Ne correspond pas"}
      aria-label={ok ? "OK" : "KO"}
      style={{
        display: "inline-block",
        width: "0.65rem",
        height: "0.65rem",
        borderRadius: "999px",
        background: ok ? "#22c55e" : "#ef4444",
        flexShrink: 0,
      }}
    />
  );
}

export function SegmentBreakdownTree({
  node,
  depth = 0,
}: {
  node: SegmentConditionBreakdownNode;
  depth?: number;
}) {
  const pad = { paddingLeft: `${depth * 0.75}rem` };

  if (node.kind === "rule") {
    return (
      <div className="diag-rule" style={pad}>
        <div className="diag-rule-head">
          <Pill ok={node.matches} />
          <span className="diag-rule-meta">
            <span className="diag-label">Attendu</span> {node.expected}
          </span>
        </div>
        <div className="diag-rule-actual" style={{ paddingLeft: "1.1rem" }}>
          <span className="diag-label">Actuel</span> {node.actual}
        </div>
      </div>
    );
  }

  if (node.kind === "allOf") {
    return (
      <div className="diag-group" style={pad}>
        <div className="diag-group-title">
          <Pill ok={node.matches} />
          <span>Tous les critères (ET)</span>
        </div>
        {node.children.map((child, i) => (
          <SegmentBreakdownTree key={i} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  if (node.kind === "anyOf") {
    return (
      <div className="diag-group" style={pad}>
        <div className="diag-group-title">
          <Pill ok={node.matches} />
          <span>Au moins un critère (OU)</span>
        </div>
        {node.children.map((child, i) => (
          <SegmentBreakdownTree key={i} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="diag-group" style={pad}>
      <div className="diag-group-title">
        <Pill ok={node.matches} />
        <span>Négation (NON)</span>
      </div>
      <SegmentBreakdownTree node={node.child} depth={depth + 1} />
    </div>
  );
}
