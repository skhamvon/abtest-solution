import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countSegmentLeaves, type SegmentConfig } from "@abtest-solution/core";
import { API_BASE } from "../apiBase";

export function SegmentListPage() {
  const [segments, setSegments] = useState<SegmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/segments`);
        if (!res.ok) throw new Error(`Erreur API ${res.status}`);
        const data = (await res.json()) as SegmentConfig[];
        if (!cancelled) setSegments(data);
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
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Segments</h2>
        <Link to="/">← Campagnes</Link>
      </div>
      {loading && <p>Chargement…</p>}
      {error && <p>Erreur : {error}</p>}
      {!loading && !error && segments.length === 0 && (
        <p>Aucun segment.</p>
      )}
      {!loading && !error && segments.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Règles</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.id}>
                <td>
                  <code>{s.id}</code>
                </td>
                <td>{s.name}</td>
                <td>{countSegmentLeaves(s.condition)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
