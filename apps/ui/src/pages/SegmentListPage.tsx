import { useEffect, useState } from "react";
import type { SegmentConfig } from "@abtest-solution/core";

export function SegmentListPage() {
  const [segments, setSegments] = useState<SegmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:5002/api/segments");
        if (!res.ok) {
          throw new Error(`Erreur API ${res.status}`);
        }
        const data = (await res.json()) as SegmentConfig[];
        if (!cancelled) {
          setSegments(data);
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
        <h2 className="card-title">Segments</h2>
        <button type="button" className="primary-button">
          Nouveau segment
        </button>
      </div>
      {loading && <p>Chargement des segments…</p>}
      {error && <p>Erreur: {error}</p>}
      {!loading && !error && segments.length === 0 && (
        <p>Aucun segment pour le moment.</p>
      )}
      {!loading && !error && segments.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>ID</th>
              <th>Critères</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.id}</td>
                <td>{Object.keys(s.criteria).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

