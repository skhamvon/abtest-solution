import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CampaignConfig } from "@abtest-solution/core";

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:5002/api/campaigns");
        if (!res.ok) {
          throw new Error(`Erreur API ${res.status}`);
        }
        const data = (await res.json()) as CampaignConfig[];
        if (!cancelled) {
          setCampaigns(data);
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
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Campagnes</h2>
        <button type="button" className="primary-button">
          Nouvelle campagne
        </button>
      </div>
      {loading && <p>Chargement des campagnes…</p>}
      {error && <p>Erreur: {error}</p>}
      {!loading && !error && campaigns.length === 0 && (
        <p>Aucune campagne pour le moment.</p>
      )}
      {!loading && !error && campaigns.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Status</th>
              <th>Segments</th>
              <th>Variations</th>
              <th>Simulation</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr
                key={c.id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/campaigns/${c.id}`)}
              >
                <td>{c.name}</td>
                <td>{c.type}</td>
                <td>
                  <span className={`status-pill status-${c.status}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.segments.length}</td>
                <td>{c.variations.length}</td>
                <td>
                  {/* Lien de simulation simple basé sur l'id de campagne */}
                  <code>?ab_campaign_id={c.id}&amp;ab_simulation=1</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

