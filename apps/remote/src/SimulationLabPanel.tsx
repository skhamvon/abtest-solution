import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CampaignConfig,
  SegmentConditionBreakdownNode,
  VariationConfig,
} from "@abtest-solution/core";
import { variationSlot } from "@abtest-solution/core";
import { buildBrowserEvaluateContext } from "./evaluateContext";
import styles from "./SimulationLabPanel.module.css";

type SegmentDiagnosticsPayload = {
  campaignId: number;
  segments: Array<{
    id: number;
    name: string;
    matches: boolean;
    breakdown: SegmentConditionBreakdownNode;
  }>;
};

function SegmentBreakdownTree({
  node,
  depth = 0,
}: {
  node: SegmentConditionBreakdownNode;
  depth?: number;
}) {
  const pad = { paddingLeft: `${depth * 0.65}rem` };

  if (node.kind === "rule") {
    return (
      <div className={styles.diagRule} style={pad}>
        <div className={styles.diagRuleHead}>
          <span
            className={`${styles.pill} ${node.matches ? styles.pillOk : styles.pillKo}`}
            title={node.matches ? "OK" : "KO"}
            aria-label={node.matches ? "OK" : "KO"}
          />
          <span>
            <span className={styles.diagLabel}>Attendu</span>
            {node.expected}
          </span>
        </div>
        <div className={styles.diagActual}>
          <span className={styles.diagLabel}>Actuel</span>
          {node.actual}
        </div>
      </div>
    );
  }

  if (node.kind === "allOf") {
    return (
      <div className={styles.diagGroup} style={pad}>
        <div className={styles.diagGroupTitle}>
          <span
            className={`${styles.pill} ${node.matches ? styles.pillOk : styles.pillKo}`}
          />
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
      <div className={styles.diagGroup} style={pad}>
        <div className={styles.diagGroupTitle}>
          <span
            className={`${styles.pill} ${node.matches ? styles.pillOk : styles.pillKo}`}
          />
          <span>Au moins un critère (OU)</span>
        </div>
        {node.children.map((child, i) => (
          <SegmentBreakdownTree key={i} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.diagGroup} style={pad}>
      <div className={styles.diagGroupTitle}>
        <span
          className={`${styles.pill} ${node.matches ? styles.pillOk : styles.pillKo}`}
        />
        <span>Négation (NON)</span>
      </div>
      <SegmentBreakdownTree node={node.child} depth={depth + 1} />
    </div>
  );
}

function sortVariations(list: VariationConfig[]): VariationConfig[] {
  return [...list].sort((a, b) => {
    const sa = variationSlot(a.id);
    const sb = variationSlot(b.id);
    if (sa !== sb) return sa - sb;
    return a.id - b.id;
  });
}

export type SimulationLabPanelProps = {
  apiBase: string;
  campaignId: number;
  campaign: CampaignConfig;
  activeVariation: VariationConfig;
  evaluateReason: string;
  /** Variation imposée par l’URL (`ab_variation_id`), sinon `null` (choix moteur). */
  forcedVariationId: number | null;
  /** Réévalue le diagnostic quand l’URL / la navigation change (ex. même clé que le slot). */
  diagnosticsRefreshKey: string;
};

function setLocationSearch(updater: (params: URLSearchParams) => void) {
  const u = new URL(window.location.href);
  updater(u.searchParams);
  const next = `${u.pathname}${u.search}${u.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function SimulationLabPanel({
  apiBase,
  campaignId,
  campaign,
  activeVariation,
  evaluateReason,
  forcedVariationId,
  diagnosticsRefreshKey,
}: SimulationLabPanelProps) {
  const [minimized, setMinimized] = useState(false);
  const [diagLoading, setDiagLoading] = useState(true);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagData, setDiagData] = useState<SegmentDiagnosticsPayload | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDiagLoading(true);
      setDiagError(null);
      try {
        const context = buildBrowserEvaluateContext();
        const res = await fetch(`${apiBase}/api/evaluate/segment-diagnostics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            context,
            simulation: {},
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? `Erreur ${res.status}`);
        }
        if (!cancelled) {
          setDiagData(body as SegmentDiagnosticsPayload);
        }
      } catch (e) {
        if (!cancelled) {
          setDiagError((e as Error).message);
          setDiagData(null);
        }
      } finally {
        if (!cancelled) setDiagLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBase, campaignId, diagnosticsRefreshKey]);

  function selectVariation(id: number | "auto") {
    setLocationSearch((params) => {
      if (id === "auto") {
        params.delete("ab_variation_id");
      } else {
        params.set("ab_variation_id", String(id));
      }
      if (
        params.get("ab_simulation") !== "1" &&
        params.get("ab_force") !== "1"
      ) {
        params.set("ab_simulation", "1");
      }
    });
  }

  const variations = sortVariations(campaign.variations);

  const panel = (
    <div
      className={`${styles.wrap} ${minimized ? styles.wrapMin : ""}`}
      role="dialog"
      aria-label="Simulation A/B"
      data-abtest-simulation-panel=""
    >
      <div className={styles.head}>
        <h2 className={styles.title}>Simulation</h2>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setMinimized((m) => !m)}
            aria-expanded={!minimized}
            title={minimized ? "Agrandir" : "Réduire"}
          >
            {minimized ? "▢" : "—"}
          </button>
        </div>
      </div>
      {!minimized ? (
        <div className={styles.body}>
          <p className={styles.muted}>
            Campagne <strong>{campaign.name}</strong> ({campaignId}) · motif{" "}
            <code>{evaluateReason}</code>
          </p>

          <p className={styles.sectionLabel}>Variation appliquée</p>
          <div className={styles.variations}>
            <button
              type="button"
              className={`${styles.varBtn} ${forcedVariationId === null ? styles.varBtnActive : ""}`}
              onClick={() => selectVariation("auto")}
            >
              Automatique (moteur)
              <span className={styles.varMeta}>
                Variante courante : {activeVariation.name} ({activeVariation.id}
                )
              </span>
            </button>
            {variations.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`${styles.varBtn} ${forcedVariationId === v.id ? styles.varBtnActive : ""}`}
                onClick={() => selectVariation(v.id)}
              >
                {variationSlot(v.id) === 0 ? "Original · " : ""}
                {v.name}
                <span className={styles.varMeta}>
                  id {v.id} · trafic {v.trafficAllocation}%
                </span>
              </button>
            ))}
          </div>

          <p className={styles.sectionLabel}>Ciblage (segments)</p>
          {diagLoading ? (
            <p className={styles.loading}>Analyse des segments…</p>
          ) : null}
          {diagError ? <p className={styles.err}>{diagError}</p> : null}
          {!diagLoading && !diagError && diagData ? (
            <>
              {diagData.segments.length === 0 ? (
                <p className={styles.muted}>Aucun segment sur cette campagne.</p>
              ) : null}
              {diagData.segments.map((seg) => (
                <div key={seg.id} className={styles.segBlock}>
                  <div className={styles.segHead}>
                    <span
                      className={`${styles.pill} ${seg.matches ? styles.pillOk : styles.pillKo}`}
                      title={seg.matches ? "Éligible" : "Non éligible"}
                    />
                    <span>
                      {seg.name}{" "}
                      <span style={{ opacity: 0.6 }}>({seg.id})</span>
                    </span>
                  </div>
                  <SegmentBreakdownTree node={seg.breakdown} />
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <div className={styles.body} style={{ padding: "0.4rem 0.65rem" }}>
          <p className={styles.muted} style={{ margin: 0 }}>
            {activeVariation.name} · réduire pour détails
          </p>
        </div>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
