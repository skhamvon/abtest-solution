import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { countSegmentLeaves, type SegmentConfig } from "@abtest-solution/core";
import {
  type SegmentSortKey,
  sortSegments,
} from "@/lib/segmentSort";
import type { SortDir } from "@/lib/sortTypes";
import { API_BASE } from "../apiBase";
import { SortableTh } from "../ui/SortableTh";

export function SegmentListPage() {
  const [segments, setSegments] = useState<SegmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{
    key: SegmentSortKey;
    dir: SortDir;
  }>({ key: "id", dir: "asc" });

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

  const visibleSegments = useMemo(
    () => sortSegments(segments, sortState.key, sortState.dir),
    [segments, sortState],
  );

  function handleSort(columnKey: string) {
    const key = columnKey as SegmentSortKey;
    setSortState((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Segments</h2>
        <Link to="/campaigns" className="link-back">
          ← Campagnes
        </Link>
      </div>
      {loading && <p>Chargement…</p>}
      {error && <p>Erreur : {error}</p>}
      {!loading && !error && segments.length === 0 && <p>Aucun segment.</p>}
      {!loading && !error && segments.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <SortableTh
                  label="ID"
                  columnKey="id"
                  activeKey={sortState.key}
                  dir={sortState.dir}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Nom"
                  columnKey="name"
                  activeKey={sortState.key}
                  dir={sortState.dir}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Règles"
                  columnKey="rules"
                  activeKey={sortState.key}
                  dir={sortState.dir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {visibleSegments.map((s) => (
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
        </div>
      )}
    </div>
  );
}
