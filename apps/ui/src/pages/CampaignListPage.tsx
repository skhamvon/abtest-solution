import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CampaignConfig } from "@abtest-solution/core";

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftId, setDraftId] = useState("");
  const [draftType, setDraftType] = useState<"frontend" | "backend">(
    "frontend",
  );

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
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setDraftName("");
            setDraftId("");
            setDraftType("frontend");
            setCreateError(null);
            setCreating(true);
          }}
        >
          Nouvelle campagne
        </button>
      </div>
      {creating && (
        <div style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          <div style={{ marginBottom: "0.4rem" }}>
            Créer une nouvelle campagne
          </div>
          <div
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <input
              placeholder="Nom lisible"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <input
              placeholder="ID technique"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            />
            <select
              value={draftType}
              onChange={(e) =>
                setDraftType(e.target.value as "frontend" | "backend")
              }
            >
              <option value="frontend">frontend</option>
              <option value="backend">backend</option>
            </select>
            <button
              type="button"
              className="primary-button"
              onClick={async () => {
                if (!draftName || !draftId) {
                  setCreateError("Nom et ID sont requis");
                  return;
                }
                try {
                  setCreateError(null);
                  const res = await fetch(
                    "http://localhost:5002/api/campaigns",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: draftId,
                        name: draftName,
                        type: draftType,
                      }),
                    },
                  );
                  if (!res.ok) {
                    throw new Error(`Erreur API ${res.status}`);
                  }
                  const created = (await res.json()) as CampaignConfig;
                  setCampaigns((prev) => [...prev, created]);
                  setCreating(false);
                } catch (e) {
                  setCreateError((e as Error).message);
                }
              }}
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateError(null);
              }}
            >
              Annuler
            </button>
          </div>
          {createError && <p>Erreur création: {createError}</p>}
        </div>
      )}
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

