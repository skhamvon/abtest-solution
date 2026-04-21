import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type SegmentListRow,
  type SegmentSortKey,
  sortSegments,
} from "@/lib/segmentSort";
import type { SortDir } from "@/lib/sortTypes";
import { API_BASE } from "../apiBase";
import { SortableTh } from "../ui/SortableTh";
import { SegmentEditorModal } from "../ui/SegmentEditorModal";

async function readApiError(res: Response): Promise<string> {
  let msg = `Erreur HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) {
      msg = body.error.trim();
    }
  } catch {
    /* ignore */
  }
  return msg;
}

export function SegmentListPage() {
  const [segments, setSegments] = useState<SegmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{
    key: SegmentSortKey;
    dir: SortDir;
  }>({ key: "id", dir: "asc" });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorSegmentId, setEditorSegmentId] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);

  const loadSegments = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/segments`);
    if (!res.ok) throw new Error(`Erreur API ${res.status}`);
    const data = (await res.json()) as SegmentListRow[];
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await loadSegments();
        if (!cancelled) setSegments(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadSegments]);

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

  function openCreate() {
    setEditorMode("create");
    setEditorSegmentId(null);
    setEditorOpen(true);
  }

  function openEdit(id: number) {
    setEditorMode("edit");
    setEditorSegmentId(id);
    setEditorOpen(true);
  }

  async function handleDelete(row: SegmentListRow) {
    if (row.campaignCount > 0) return;
    if (
      !window.confirm(
        `Supprimer le segment « ${row.name} » (id ${row.id}) ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    setDeleteBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/segments/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      setSegments(await loadSegments());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <>
      <div className="list-page-layout">
        <div className="list-page-layout__primary">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Segments</h2>
              <button
                type="button"
                className="primary-button"
                disabled={loading}
                onClick={openCreate}
              >
                Nouveau segment
              </button>
            </div>
            <p className="list-page-lede muted text-small">
              <Link to="/campaigns" className="link-back">
                ← Campagnes
              </Link>
              <span className="list-page-lede__sep" aria-hidden>
                {" "}
                ·{" "}
              </span>
              Segments partagés entre campagnes ; la suppression n’est possible
              que si aucune campagne ne les référence encore.
            </p>
            {loading && <p>Chargement des segments…</p>}
            {error && <p>Erreur: {error}</p>}
            {!loading && !error && segments.length === 0 && (
              <p>Aucun segment pour le moment.</p>
            )}
            {!loading && !error && segments.length > 0 && (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Nom"
                        columnKey="name"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="ID"
                        columnKey="id"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="Campagnes"
                        columnKey="campaignCount"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSegments.map((s) => (
                      <tr
                        key={s.id}
                        className="row-click"
                        onClick={() => openEdit(s.id)}
                      >
                        <td>{s.name}</td>
                        <td>
                          <code>{s.id}</code>
                        </td>
                        <td>
                          {s.campaignCount > 0 ? (
                            <span className="tag-pill">{s.campaignCount}</span>
                          ) : (
                            <span className="muted text-small">—</span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="segment-list__actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => openEdit(s.id)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={
                                s.campaignCount > 0 || deleteBusyId === s.id
                              }
                              title={
                                s.campaignCount > 0
                                  ? `Utilisé par ${s.campaignCount} campagne(s) — retirez-le du ciblage avant suppression.`
                                  : undefined
                              }
                              onClick={() => void handleDelete(s)}
                            >
                              {deleteBusyId === s.id ? "…" : "Supprimer"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <SegmentEditorModal
        open={editorOpen}
        mode={editorMode}
        segmentId={editorSegmentId}
        segments={segments}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          try {
            setSegments(await loadSegments());
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    </>
  );
}
