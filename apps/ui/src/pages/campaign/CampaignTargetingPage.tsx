import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type {
  CampaignConfig,
  SegmentConditionBreakdownNode,
  SegmentConfig,
} from "@abtest-solution/core";
import { SegmentBreakdownTree } from "@/ui/SegmentBreakdownTree";
import { API_BASE } from "@/apiBase";
import type { CampaignOutletContext } from "./campaignOutletContext";

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

type TrafficRow = {
  id: number;
  name: string;
  trafficAllocation: number;
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

export function CampaignTargetingPage() {
  const { campaign, setCampaign } = useOutletContext<CampaignOutletContext>();

  const [trafficDraft, setTrafficDraft] = useState<TrafficRow[]>(() =>
    campaign.variations.map((v) => ({
      id: v.id,
      name: v.name,
      trafficAllocation: v.trafficAllocation,
    })),
  );
  const [trafficSaving, setTrafficSaving] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);

  const [allSegments, setAllSegments] = useState<SegmentConfig[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() =>
    new Set(campaign.segments),
  );
  const [segmentsSaving, setSegmentsSaving] = useState(false);
  const [segmentsSaveError, setSegmentsSaveError] = useState<string | null>(
    null,
  );

  const [contextJson, setContextJson] = useState(DEFAULT_CONTEXT_JSON);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [diagnosticData, setDiagnosticData] =
    useState<SegmentDiagnosticsPayload | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(campaign.segments));
    setTrafficDraft(
      campaign.variations.map((v) => ({
        id: v.id,
        name: v.name,
        trafficAllocation: v.trafficAllocation,
      })),
    );
  }, [campaign]);

  const trafficTotal = useMemo(
    () => trafficDraft.reduce((s, r) => s + r.trafficAllocation, 0),
    [trafficDraft],
  );
  const trafficValid = trafficTotal === 100;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setSegmentsLoading(true);
        setSegmentsError(null);
        const res = await fetch(`${API_BASE}/api/segments`);
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}`);
        }
        const data = (await res.json()) as SegmentConfig[];
        if (!cancelled) {
          data.sort((a, b) => a.id - b.id);
          setAllSegments(data);
        }
      } catch (e) {
        if (!cancelled) setSegmentsError((e as Error).message);
      } finally {
        if (!cancelled) setSegmentsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setTrafficForId(id: number, value: number) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value)) || 0));
    setTrafficDraft((rows) =>
      rows.map((r) => (r.id === id ? { ...r, trafficAllocation: n } : r)),
    );
  }

  function splitEvenly() {
    const n = trafficDraft.length;
    if (n === 0) return;
    const base = Math.floor(100 / n);
    const rest = 100 - base * n;
    setTrafficDraft((rows) =>
      rows.map((r, i) => ({
        ...r,
        trafficAllocation: base + (i < rest ? 1 : 0),
      })),
    );
  }

  async function saveTraffic() {
    if (!trafficValid) return;
    setTrafficSaving(true);
    setTrafficError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variations: trafficDraft.map((r) => ({
            id: r.id,
            trafficAllocation: r.trafficAllocation,
          })),
        }),
      });
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
    } catch (e) {
      setTrafficError((e as Error).message);
    } finally {
      setTrafficSaving(false);
    }
  }

  function toggleSegment(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveSegments() {
    const ordered = [...selectedIds].sort((a, b) => a - b);
    setSegmentsSaving(true);
    setSegmentsSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: ordered }),
      });
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
    } catch (e) {
      setSegmentsSaveError((e as Error).message);
    } finally {
      setSegmentsSaving(false);
    }
  }

  async function runSegmentDiagnostics() {
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

  return (
    <>
      <section className="campaign-section" aria-labelledby="camp-traffic-title">
        <h3 id="camp-traffic-title" className="subsection-title">
          Allocation du trafic
        </h3>
        <p className="section-hint text-small">
          La somme des pourcentages doit être exactement <strong>100</strong> pour
          enregistrer. Les noms des variations ne sont pas modifiables ici.
        </p>
        <ul className="campaign-traffic-list">
          {trafficDraft.map((row) => (
            <li key={row.id} className="campaign-traffic-row">
              <span className="campaign-traffic-row__label">
                <strong>{row.name}</strong>{" "}
                <code className="code-inline">({row.id})</code>
              </span>
              <label className="campaign-traffic-row__input">
                <span className="sr-only">Pourcentage pour {row.name}</span>
                <input
                  type="number"
                  className="field-input"
                  min={0}
                  max={100}
                  step={1}
                  value={row.trafficAllocation}
                  onChange={(e) =>
                    setTrafficForId(row.id, Number(e.target.value))
                  }
                  aria-label={`Pourcentage pour ${row.name}`}
                />
                <span aria-hidden>%</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="campaign-traffic-total text-small">
          Total : <strong>{trafficTotal}</strong> %{" "}
          {!trafficValid ? (
            <span className="diag-error" style={{ marginLeft: "0.35rem" }}>
              (ajuster pour atteindre 100 %)
            </span>
          ) : (
            <span className="muted" style={{ marginLeft: "0.35rem" }}>
              OK
            </span>
          )}
        </p>
        <div className="inline-row" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ghost-button"
            disabled={trafficDraft.length === 0}
            onClick={splitEvenly}
          >
            Répartir équitablement
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={trafficSaving || !trafficValid}
            onClick={() => void saveTraffic()}
          >
            {trafficSaving ? "Enregistrement…" : "Enregistrer l’allocation"}
          </button>
        </div>
        {trafficError ? (
          <p className="diag-error" style={{ marginTop: "0.5rem" }}>
            {trafficError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section" aria-labelledby="camp-seg-title">
        <h3 id="camp-seg-title" className="subsection-title">
          Segments rattachés
        </h3>
        <p className="section-hint text-small">
          Cochez les segments éligibles pour cette campagne (liste triée par id).
          L’ordre est normalisé à l’enregistrement.
        </p>
        {segmentsLoading ? (
          <p className="text-small muted">Chargement des segments…</p>
        ) : null}
        {segmentsError ? (
          <p className="diag-error">{segmentsError}</p>
        ) : null}
        {!segmentsLoading && !segmentsError ? (
          <ul className="campaign-segment-pick-list">
            {allSegments.map((s) => (
              <li key={s.id}>
                <label className="campaign-segment-pick-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSegment(s.id)}
                  />
                  <span>
                    <strong>{s.name}</strong>{" "}
                    <code className="code-inline">({s.id})</code>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {!segmentsLoading && !segmentsError && allSegments.length === 0 ? (
          <p className="text-small muted">Aucun segment dans le dépôt.</p>
        ) : null}
        <p style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="primary-button"
            disabled={segmentsSaving || segmentsLoading}
            onClick={() => void saveSegments()}
          >
            {segmentsSaving ? "Enregistrement…" : "Enregistrer les segments"}
          </button>
        </p>
        {segmentsSaveError ? (
          <p className="diag-error" style={{ marginTop: "0.5rem" }}>
            {segmentsSaveError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section" aria-labelledby="camp-diag-title">
        <h3 id="camp-diag-title" className="subsection-title">
          Diagnostic segments (simulation)
        </h3>
        <p className="section-hint text-small">
          Contexte JSON envoyé au moteur (même forme que pour{" "}
          <code className="code-inline">POST /api/evaluate</code>). Un objet{" "}
          <code className="code-inline">simulation</code> non vide est requis
          côté API pour ce mode lab.
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
            {diagnosticLoading ? "Analyse…" : "Lancer le diagnostic"}
          </button>
        </p>
      </section>

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
            <p className="section-hint">
              Campagne {diagnosticData.campaignId} ·{" "}
              {diagnosticData.segments.length} segment
              {diagnosticData.segments.length > 1 ? "s" : ""} rattaché
              {diagnosticData.segments.length > 1 ? "s" : ""}
            </p>
            {diagnosticData.segments.length === 0 ? (
              <p className="text-small">Aucun segment sur cette campagne.</p>
            ) : null}
            {diagnosticData.segments.map((seg) => (
              <div key={seg.id} className="diag-segment-block">
                <div className="diag-segment-head">
                  <SegmentPill ok={seg.matches} />
                  <span>
                    {seg.name}{" "}
                    <code className="code-inline">({seg.id})</code>
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
