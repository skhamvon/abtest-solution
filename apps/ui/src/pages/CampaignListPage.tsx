import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCampaignPrivacyMode,
  type CampaignConfig,
  type CampaignStatus,
} from "@abtest-solution/core";
import {
  CAMPAIGN_STATUSES,
  type StatusChangePending,
} from "@/campaignStatusOptions";
import {
  campaignMatchesListFilters,
  createEmptyCampaignListFilter,
  type CampaignListFilterState,
} from "@/lib/campaignFilters";
import {
  type CampaignSortKey,
  sortCampaigns,
} from "@/lib/campaignSort";
import type { SortDir } from "@/lib/sortTypes";
import { API_BASE } from "../apiBase";
import type { ConsentConfigApi } from "../simulationUrl";
import { SimulationLaunchLinks } from "../ui/SimulationLaunchLinks";
import { ConfirmCampaignStatusModal } from "../ui/ConfirmCampaignStatusModal";
import { CreateCampaignModal } from "../ui/CreateCampaignModal";
import { CampaignFilterDrawer } from "../ui/CampaignFilterDrawer";
import { SortableTh } from "../ui/SortableTh";
import { formatCampaignInstant } from "../lib/formatCampaignDate";

const FILTER_DRAWER_LS = "abtest-ui-campaign-filter-expanded";

function privacyLabel(c: CampaignConfig): string {
  return getCampaignPrivacyMode(c) === "measurement" ? "Mesure" : "Technique";
}

function typeLabel(type: CampaignConfig["type"]): string {
  return type === "frontend" ? "Frontend" : "Backend";
}

export function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>([]);
  const [consentConfig, setConsentConfig] = useState<ConsentConfigApi | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const [statusConfirm, setStatusConfirm] = useState<StatusChangePending | null>(
    null,
  );
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [sortState, setSortState] = useState<{
    key: CampaignSortKey;
    dir: SortDir;
  }>({ key: "name", dir: "asc" });

  const [listFilter, setListFilter] = useState<CampaignListFilterState>(() =>
    createEmptyCampaignListFilter(),
  );
  const [filterExpanded, setFilterExpanded] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(FILTER_DRAWER_LS) === "0") {
        setFilterExpanded(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_DRAWER_LS, filterExpanded ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [filterExpanded]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [campRes, consentRes] = await Promise.all([
          fetch(`${API_BASE}/api/campaigns`),
          fetch(`${API_BASE}/api/consent-config`),
        ]);
        if (!campRes.ok) {
          throw new Error(`Erreur API ${campRes.status}`);
        }
        const data = (await campRes.json()) as CampaignConfig[];
        if (!cancelled) {
          setCampaigns(data);
          if (consentRes.ok) {
            setConsentConfig((await consentRes.json()) as ConsentConfigApi);
          } else {
            setConsentConfig(null);
          }
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

  const visibleCampaigns = useMemo(() => {
    const filtered = campaigns.filter((c) =>
      campaignMatchesListFilters(c, listFilter),
    );
    return sortCampaigns(filtered, sortState.key, sortState.dir);
  }, [campaigns, listFilter, sortState]);

  function handleSort(columnKey: string) {
    const key = columnKey as CampaignSortKey;
    setSortState((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  async function confirmStatusChange() {
    if (!statusConfirm) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/campaigns/${statusConfirm.campaignId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusConfirm.next }),
        },
      );
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaigns((prev) => prev.map((c) => (c.id === body.id ? body : c)));
      setStatusConfirm(null);
    } catch (e) {
      setStatusError((e as Error).message);
    } finally {
      setStatusSaving(false);
    }
  }

  function cancelStatusChange() {
    setStatusConfirm(null);
    setStatusError(null);
  }

  const selectsLocked = statusConfirm !== null || statusSaving;

  return (
    <>
      <div className="list-page-layout list-page-layout--with-filter-tab">
        <div className="list-page-layout__primary">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Campagnes</h2>
              <button
                type="button"
                className="primary-button"
                disabled={loading}
                onClick={() => setCreating(true)}
              >
                Nouvelle campagne
              </button>
            </div>
            {loading && <p>Chargement des campagnes…</p>}
            {error && <p>Erreur: {error}</p>}
            {!loading && !error && campaigns.length === 0 && (
              <p>Aucune campagne pour le moment.</p>
            )}
            {!loading && !error && campaigns.length > 0 && (
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
                        label="Canal"
                        columnKey="type"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="Confidentialité"
                        columnKey="privacy"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="Statut"
                        columnKey="status"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="Création"
                        columnKey="createdAt"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="1re mise en ligne"
                        columnKey="firstPublishedAt"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <SortableTh
                        label="Dernier statut"
                        columnKey="lastStatusChangeAt"
                        activeKey={sortState.key}
                        dir={sortState.dir}
                        onSort={handleSort}
                      />
                      <th scope="col">Tags</th>
                      <th scope="col">Simulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCampaigns.map((c) => (
                      <tr
                        key={c.id}
                        className="row-click"
                        onClick={() => navigate(`/campaigns/${c.id}`)}
                      >
                        <td>{c.name}</td>
                        <td>
                          <span className={`type-pill type-${c.type}`}>
                            {typeLabel(c.type)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`privacy-pill privacy-${getCampaignPrivacyMode(c)}`}
                          >
                            {privacyLabel(c)}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="field-input table-status-select"
                            aria-label={`Statut de la campagne ${c.name}`}
                            disabled={selectsLocked}
                            value={
                              statusConfirm?.campaignId === c.id
                                ? statusConfirm.previous
                                : c.status
                            }
                            onChange={(e) => {
                              e.stopPropagation();
                              const next = e.target.value as CampaignStatus;
                              if (next === c.status) return;
                              setStatusError(null);
                              setStatusConfirm({
                                campaignId: c.id,
                                name: c.name,
                                previous: c.status,
                                next,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {CAMPAIGN_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="table-cell-date">
                          {formatCampaignInstant(c.createdAt)}
                        </td>
                        <td className="table-cell-date">
                          {formatCampaignInstant(c.firstPublishedAt)}
                        </td>
                        <td className="table-cell-date">
                          {formatCampaignInstant(c.lastStatusChangeAt)}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="table-tags-cell">
                            {(c.tags ?? []).length === 0 ? (
                              <span className="muted text-small">—</span>
                            ) : (
                              (c.tags ?? []).map((t) => (
                                <span key={t} className="tag-pill">
                                  {t}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <SimulationLaunchLinks
                            campaign={c}
                            consent={consentConfig}
                            compact
                          />
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

      {!loading && !error ? (
        <CampaignFilterDrawer
          campaigns={campaigns}
          visibleCount={visibleCampaigns.length}
          filter={listFilter}
          setFilter={setListFilter}
          expanded={filterExpanded}
          onToggleExpanded={() => setFilterExpanded((v) => !v)}
          onClearAll={() => setListFilter(createEmptyCampaignListFilter())}
        />
      ) : null}

      <ConfirmCampaignStatusModal
        pending={statusConfirm}
        saving={statusSaving}
        error={statusError}
        onCancel={cancelStatusChange}
        onConfirm={confirmStatusChange}
      />

      <CreateCampaignModal
        open={creating}
        campaigns={campaigns}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCampaigns((prev) => [...prev, c]);
          setCreating(false);
          navigate(`/campaigns/${c.id}`);
        }}
      />
    </>
  );
}
