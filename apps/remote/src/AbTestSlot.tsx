import { useEffect, useMemo, useState } from "react";
import type { EvaluatedVariation } from "@abtest-solution/core";

interface EvaluateResponse extends EvaluatedVariation {
  matchedSegmentIds?: string[];
  campaignSegments?: { id: string; name: string }[];
}

type DeviceKind = "mobile" | "desktop" | "tablet";

function detectDevice(): DeviceKind {
  const ua = navigator.userAgent || navigator.vendor || "";
  if (/android|iphone|ipad|ipod|windows phone/i.test(ua)) {
    return "mobile";
  }
  if (/tablet|ipad/i.test(ua)) {
    return "tablet";
  }
  return "desktop";
}

async function evaluateFrontendCampaign(
  campaignId: string,
  simulationVariationId?: string,
): Promise<EvaluateResponse | null> {
  const url = "http://localhost:5002/api/evaluate";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId,
      context: {
        userId: "demo-user",
        route: window.location.pathname,
        device: detectDevice(),
      },
      simulation: simulationVariationId ? { variationId: simulationVariationId } : null,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as EvaluateResponse;
  return data;
}

function injectAssets(jsPath?: string, cssPath?: string) {
  const head = document.head;
  if (cssPath) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssPath;
    link.dataset.abtestStyle = "1";
    head.appendChild(link);
  }
  if (jsPath) {
    const script = document.createElement("script");
    script.src = jsPath;
    script.async = true;
    script.dataset.abtestScript = "1";
    head.appendChild(script);
  }
}

function cleanupAssets() {
  document
    .querySelectorAll("link[data-abtest-style='1'], script[data-abtest-script='1']")
    .forEach((el) => el.parentElement?.removeChild(el));
}

export function AbTestSlot() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; result: EvaluateResponse }
  >({ status: "loading" });

  const simulationInfo = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    const sim = search.get("ab_simulation") === "1";
    const campaignParam = search.get("ab_campaign_id");
    const variationParam = search.get("ab_variation_id") || undefined;
    const campaignId = campaignParam || "demo-frontend-campaign";
    const enabled = sim && !!campaignParam;
    return { enabled, variationParam, campaignId };
  }, []);

  const [simulationVariationId, setSimulationVariationId] = useState<
    string | undefined
  >(simulationInfo.variationParam);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const result = await evaluateFrontendCampaign(
          simulationInfo.campaignId,
          simulationInfo.enabled ? simulationVariationId : undefined,
        );
        if (!result) {
          if (!cancelled) {
            setState({ status: "error", message: "Aucune variation trouvée" });
          }
          return;
        }
        const { variation, reason } = result;
        cleanupAssets();
        injectAssets(variation.jsPath, variation.cssPath);
        console.info(
          "[abtest-remote] Variation active",
          {
            campaignId: simulationInfo.campaignId,
            variationId: variation.id,
            variationName: variation.name,
            reason,
          },
        );
        if (!cancelled) {
          setState({
            status: "ready",
            result,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: (e as Error).message,
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      cleanupAssets();
    };
  }, [simulationInfo.campaignId, simulationInfo.enabled, simulationVariationId]);

  if (state.status === "error") {
    return (
      <div data-abtest-slot>
        Erreur A/B test (voir console): {state.message}
      </div>
    );
  }

  // En régime nominal (et pendant le chargement), on ne rend rien de visible
  // sauf en mode simulation où l'on affiche un petit panneau pour choisir la variation.
  if (!simulationInfo.enabled || state.status !== "ready") {
    return null;
  }

  const { campaign, variation: activeVariation } = state.result;
  const matchedSegmentIds = new Set(state.result.matchedSegmentIds ?? []);
  const campaignSegments = state.result.campaignSegments ?? [];

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        zIndex: 9999,
        padding: "0.6rem 0.8rem",
        borderRadius: "0.75rem",
        background: "rgba(15,23,42,0.95)",
        border: "1px solid rgba(148,163,184,0.6)",
        color: "#e5e7eb",
        fontSize: "0.8rem",
        maxWidth: "260px",
      }}
      data-abtest-simulation-panel
    >
      <div style={{ marginBottom: "0.4rem", fontWeight: 600 }}>
        Simulation A/B – {campaign.name}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
        {campaign.variations.map((v) => {
          const isActive = v.id === activeVariation.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSimulationVariationId(v.id)}
              style={{
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.7)",
                padding: "0.15rem 0.5rem",
                background: isActive
                  ? "linear-gradient(135deg,#2563eb,#7c3aed)"
                  : "transparent",
                color: isActive ? "#e5e7eb" : "#cbd5f5",
                cursor: "pointer",
              }}
            >
              {v.name}
            </button>
          );
        })}
      </div>
      {campaignSegments.length > 0 && (
        <div style={{ marginTop: "0.5rem", borderTop: "1px solid rgba(148,163,184,0.4)", paddingTop: "0.4rem" }}>
          <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
            Ciblage (session actuelle)
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {campaignSegments.map((s) => {
              const matched = matchedSegmentIds.has(s.id);
              return (
                <li key={s.id} style={{ fontSize: "0.75rem", marginBottom: "0.15rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "999px",
                      marginRight: "0.35rem",
                      backgroundColor: matched ? "#22c55e" : "#64748b",
                    }}
                  />
                  {s.name}{" "}
                  <span style={{ opacity: 0.7 }}>
                    ({matched ? "match" : "no match"})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AbTestSlot;

