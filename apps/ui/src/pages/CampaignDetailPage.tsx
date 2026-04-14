import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  CampaignConfig,
  SegmentConditionBreakdownNode,
} from "@abtest-solution/core";
import { parseNumericId, isCampaignId } from "@abtest-solution/core";
import { SegmentBreakdownTree } from "../ui/SegmentBreakdownTree";
import { API_BASE } from "../apiBase";

const DEFAULT_CONTEXT_JSON = `{
  "device": "mobile",
  "url": "https://example.com/page"
}`;

type SegmentDiagnosticsPayload = {
  campaignId: number;
  segments: Array<{
    id: number;
    name: string;
    matches: boolean;
    breakdown: SegmentConditionBreakdownNode;
  }>;
};

function SegmentPill({ ok }: { ok: boolean }) {
  return (
    <span
      title={ok ? "Segment éligible" : "Segment non éligible"}
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

export function CampaignDetailPage() {
  const { id: idParam } = useParams();
  const [campaign, setCampaign] = useState<CampaignConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contextJson, setContextJson] = useState(DEFAULT_CONTEXT_JSON);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [diagnosticData, setDiagnosticData] =
    useState<SegmentDiagnosticsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const n = idParam ? parseNumericId(idParam) : null;
    if (n === null || !isCampaignId(n)) {
      setError("ID campagne invalide");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/campaigns/${n}`);
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Campagne introuvable" : `Erreur ${res.status}`);
        }
        const data = (await res.json()) as CampaignConfig;
        if (!cancelled) setCampaign(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  async function runSegmentDiagnostics() {
    if (!campaign) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contextJson) as Record<string, unknown>;
    } catch {
      setDiagnosticError("JSON de contexte invalide.");
      return;
    }
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const res = await fetch(`${API_BASE}/api/evaluate/segment-diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          context: parsed,
          simulation: {},
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setDiagnosticData(body as SegmentDiagnosticsPayload);
      setDiagnosticOpen(true);
    } catch (e) {
      setDiagnosticError((e as Error).message);
    } finally {
      setDiagnosticLoading(false);
    }
  }

  if (error && !campaign) {
    return (
      <div className="card">
        <p>Erreur : {error}</p>
        <Link to="/">Retour aux campagnes</Link>
      </div>
    );
  }

  if (loading || !campaign) {
    return <p>Chargement…</p>;
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{campaign.name}</h2>
          <Link to="/">← Liste</Link>
        </div>
        <p>
          <strong>ID</strong> {campaign.id} · <strong>Type</strong> {campaign.type} ·{" "}
          <strong>Statut</strong> {campaign.status}
        </p>
        <p>
          <strong>Segments</strong> : {campaign.segments.join(", ") || "—"}
        </p>
        <h3>Variations</h3>
        <ul>
          {campaign.variations.map((v) => (
            <li key={v.id}>
              <code>{v.id}</code> — {v.name} ({v.trafficAllocation}%)
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "0.85rem" }}>
          Simulation :{" "}
          <code>
            ?ab_campaign_id={campaign.id}&amp;ab_simulation=1
          </code>
        </p>

        <h3 style={{ marginTop: "1.25rem" }}>Diagnostic segments (simulation)</h3>
        <p style={{ fontSize: "0.88rem", color: "#94a3b8" }}>
          Contexte JSON envoyé au moteur (même forme que pour{" "}
          <code style={{ fontSize: "0.85rem" }}>POST /api/evaluate</code>). Un objet{" "}
          <code>simulation</code> non vide est requis côté API pour ce mode lab.
        </p>
        <textarea
          className="diag-context-editor"
          value={contextJson}
          onChange={(e) => setContextJson(e.target.value)}
          spellCheck={false}
        />
        {diagnosticError ? <p className="diag-error">{diagnosticError}</p> : null}
        <p style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="primary-button"
            disabled={diagnosticLoading}
            onClick={() => void runSegmentDiagnostics()}
          >
            {diagnosticLoading ? "Analyse…" : "Diagnostic segments"}
          </button>
        </p>
      </div>

      {diagnosticOpen && diagnosticData ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diag-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDiagnosticOpen(false);
          }}
        >
          <div className="modal-panel">
            <div className="card-header" style={{ marginBottom: "0.75rem" }}>
              <h3 id="diag-modal-title">Détail des segments</h3>
              <button
                type="button"
                className="primary-button"
                onClick={() => setDiagnosticOpen(false)}
              >
                Fermer
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
              Campagne {diagnosticData.campaignId} · {diagnosticData.segments.length} segment
              {diagnosticData.segments.length > 1 ? "s" : ""} rattaché
              {diagnosticData.segments.length > 1 ? "s" : ""}
            </p>
            {diagnosticData.segments.length === 0 ? (
              <p style={{ fontSize: "0.9rem" }}>Aucun segment sur cette campagne.</p>
            ) : null}
            {diagnosticData.segments.map((seg) => (
              <div key={seg.id} className="diag-segment-block">
                <div className="diag-segment-head">
                  <SegmentPill ok={seg.matches} />
                  <span>
                    {seg.name} <code style={{ fontSize: "0.85rem" }}>({seg.id})</code>
                  </span>
                </div>
                <SegmentBreakdownTree node={seg.breakdown} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
