import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CampaignConfig, SegmentConfig } from "@abtest-solution/core";

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allSegments, setAllSegments] = useState<SegmentConfig[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [campaignRes, segmentsRes] = await Promise.all([
          fetch(`http://localhost:5002/api/campaigns/${id}`),
          fetch("http://localhost:5002/api/segments"),
        ]);
        if (!campaignRes.ok) {
          throw new Error(`Erreur API campagne ${campaignRes.status}`);
        }
        if (!segmentsRes.ok) {
          throw new Error(`Erreur API segments ${segmentsRes.status}`);
        }
        const data = (await campaignRes.json()) as CampaignConfig;
        const segments = (await segmentsRes.json()) as SegmentConfig[];
        if (!cancelled) {
          setCampaign(data);
          setAllSegments(segments);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return <p>Aucune campagne sélectionnée.</p>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Détail campagne</h2>
        <button
          type="button"
          className="primary-button"
          onClick={() => navigate(-1)}
        >
          Retour
        </button>
      </div>
      {loading && <p>Chargement de la campagne…</p>}
      {error && <p>Erreur: {error}</p>}
      {!loading && !error && !campaign && (
        <p>Campagne introuvable pour l&apos;id {id}.</p>
      )}
      {!loading && !error && campaign && (
        <>
          <section style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Informations</h3>
            <p>
              <strong>Nom:</strong> {campaign.name}
            </p>
            <p>
              <strong>Type:</strong> {campaign.type}
            </p>
            <p>
              <strong>Status:</strong>{" "}
              <select
                value={campaign.status}
                onChange={(e) =>
                  setCampaign({
                    ...campaign,
                    status: e.target.value as CampaignConfig["status"],
                  })
                }
              >
                <option value="draft">draft</option>
                <option value="running">running</option>
                <option value="paused">paused</option>
                <option value="stopped">stopped</option>
              </select>
            </p>
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Variations</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>ID</th>
                  <th>Trafic (%)</th>
                  <th>Simulation (lien)</th>
                </tr>
              </thead>
              <tbody>
                {campaign.variations.map((v, index) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.id}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={v.trafficAllocation}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isNaN(next)) return;
                          const updated = [...campaign.variations];
                          updated[index] = {
                            ...updated[index]!,
                            trafficAllocation: next,
                          };
                          setCampaign({ ...campaign, variations: updated });
                        }}
                        style={{ width: "4rem" }}
                      />
                    </td>
                    <td>
                      <code>
                        ?ab_campaign_id={campaign.id}
                        &amp;ab_variation_id={v.id}
                        &amp;ab_simulation=1
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Segments associés</h3>
            {allSegments.length === 0 ? (
              <p>Aucun segment disponible.</p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                {allSegments.map((s) => {
                  const checked = campaign.segments.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.15rem 0.4rem",
                        borderRadius: "999px",
                        border: "1px solid rgba(148,163,184,0.6)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(campaign.segments);
                          if (e.target.checked) {
                            next.add(s.id);
                          } else {
                            next.delete(s.id);
                          }
                          setCampaign({
                            ...campaign,
                            segments: Array.from(next),
                          });
                        }}
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 style={{ marginBottom: "0.5rem" }}>Lien de simulation</h3>
            <p style={{ fontSize: "0.85rem" }}>
              À utiliser comme query params sur le site hôte pour forcer la
              campagne (sans forcer de variation particulière):
            </p>
            <code>
              ?ab_campaign_id={campaign.id}&amp;ab_simulation=1
            </code>
          </section>

          <section style={{ marginTop: "1rem" }}>
            {saveError && <p>Erreur enregistrement: {saveError}</p>}
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={async () => {
                if (!id || !campaign) return;
                try {
                  setSaving(true);
                  setSaveError(null);
                  const res = await fetch(
                    `http://localhost:5002/api/campaigns/${id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        status: campaign.status,
                        segments: campaign.segments,
                        variations: campaign.variations.map((v) => ({
                          id: v.id,
                          trafficAllocation: v.trafficAllocation,
                        })),
                      }),
                    },
                  );
                  if (!res.ok) {
                    throw new Error(`Erreur API ${res.status}`);
                  }
                  const updated = (await res.json()) as CampaignConfig;
                  setCampaign(updated);
                } catch (e) {
                  setSaveError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

