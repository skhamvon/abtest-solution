import { useMemo, useState } from "react";
import type {
  CampaignConfig,
  CampaignStatus,
} from "@abtest-solution/core";
import { collectAllCampaignTags } from "@/lib/campaignTags";
import type { CampaignListFilterState } from "@/lib/campaignFilters";
import { campaignListFiltersAreActive } from "@/lib/campaignFilters";
import { CAMPAIGN_STATUSES } from "@/campaignStatusOptions";

type Props = {
  campaigns: CampaignConfig[];
  visibleCount: number;
  filter: CampaignListFilterState;
  setFilter: Dispatch<SetStateAction<CampaignListFilterState>>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClearAll: () => void;
};

function statusLabel(s: CampaignStatus): string {
  switch (s) {
    case "draft":
      return "Brouillon";
    case "running":
      return "En cours";
    case "paused":
      return "En pause";
    case "stopped":
      return "Arrêtée";
    default:
      return s;
  }
}

function TagFilterField({
  allTags,
  tokens,
  onAdd,
  onRemove,
}: {
  allTags: string[];
  tokens: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const known = useMemo(() => new Set(allTags), [allTags]);

  function tryAdd() {
    const t = input.trim().toLowerCase();
    setHint(null);
    if (!t) return;
    if (!known.has(t)) {
      setHint("Tag inconnu (choisir dans la liste ou saisir un tag existant).");
      return;
    }
    if (tokens.includes(t)) {
      setInput("");
      return;
    }
    onAdd(t);
    setInput("");
  }

  return (
    <div className="filter-tag-field">
      {tokens.length > 0 ? (
        <div className="filter-tag-field__chips">
          {tokens.map((t) => (
            <span key={t} className="tag-pill filter-tag-field__chip">
              {t}
              <button
                type="button"
                className="filter-tag-field__chip-remove"
                aria-label={`Retirer ${t}`}
                onClick={() => onRemove(t)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="field-input"
        list="campaign-filter-tag-datalist"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setHint(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            tryAdd();
          }
        }}
        placeholder="Tag + Entrée"
        autoComplete="off"
        aria-label="Ajouter un tag au filtre"
      />
      <datalist id="campaign-filter-tag-datalist">
        {allTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {hint ? <p className="filter-tag-field__hint diag-error">{hint}</p> : null}
      <p className="section-hint text-small" style={{ marginTop: "0.35rem" }}>
        Toutes les étiquettes listées doivent être présentes sur la campagne
        (ET).
      </p>
    </div>
  );
}

export function CampaignFilterDrawer({
  campaigns,
  visibleCount,
  filter,
  setFilter,
  expanded,
  onToggleExpanded,
  onClearAll,
}: Props) {
  const allTags = collectAllCampaignTags(campaigns);
  const active = campaignListFiltersAreActive(filter);

  function toggleStatus(s: CampaignStatus) {
    setFilter((f) => {
      const next = new Set(f.statuses);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { ...f, statuses: next };
    });
  }

  return (
    <>
      <button
        type="button"
        className={`filter-panel__tab${expanded ? " filter-panel__tab--hidden" : ""}`}
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls="campaign-filter-panel"
        title="Ouvrir les filtres"
      >
        <span className="filter-panel__tab-icon" aria-hidden>
          ⟨
        </span>
        <span className="filter-panel__tab-label">Filtres</span>
        {active ? <span className="filter-panel__tab-dot" aria-hidden /> : null}
      </button>

      <div
        id="campaign-filter-panel"
        className={`filter-panel__sheet${expanded ? " filter-panel__sheet--open" : ""}`}
        role="complementary"
        aria-label="Filtres des campagnes"
        aria-hidden={!expanded}
      >
        <div className="filter-panel__header">
          <h2 className="filter-panel__title">Filtres</h2>
          <button
            type="button"
            className="filter-panel__close"
            onClick={onToggleExpanded}
            aria-label="Fermer les filtres"
            title="Fermer"
          >
            ⟩
          </button>
        </div>

        <div className="filter-panel__scroll">
          <p className="filter-panel__meta muted text-small">
            {visibleCount} campagne{visibleCount > 1 ? "s" : ""} affichée
            {visibleCount > 1 ? "s" : ""}
            {active ? " · critères actifs" : ""}
          </p>

          <details className="filter-accordion" open>
            <summary className="filter-accordion__summary">Nom</summary>
            <div className="filter-accordion__body">
              <input
                className="field-input"
                type="search"
                value={filter.nameSubstring}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, nameSubstring: e.target.value }))
                }
                placeholder="Contient…"
                aria-label="Filtrer par nom"
              />
            </div>
          </details>

          <details className="filter-accordion" open>
            <summary className="filter-accordion__summary">Canal</summary>
            <div className="filter-accordion__body filter-accordion__body--checks">
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.typeFrontend}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      typeFrontend: !f.typeFrontend,
                    }))
                  }
                />
                <span>Frontend</span>
              </label>
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.typeBackend}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      typeBackend: !f.typeBackend,
                    }))
                  }
                />
                <span>Backend</span>
              </label>
              <p className="section-hint text-small">
                Aucune case : pas de filtre. Une seule case : ce canal uniquement.
                Les deux : tous.
              </p>
            </div>
          </details>

          <details className="filter-accordion">
            <summary className="filter-accordion__summary">
              Confidentialité
            </summary>
            <div className="filter-accordion__body filter-accordion__body--checks">
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.privacyMeasurement}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      privacyMeasurement: !f.privacyMeasurement,
                    }))
                  }
                />
                <span>Mesure</span>
              </label>
              <label className="filter-check-row">
                <input
                  type="checkbox"
                  checked={filter.privacyTechnical}
                  onChange={() =>
                    setFilter((f) => ({
                      ...f,
                      privacyTechnical: !f.privacyTechnical,
                    }))
                  }
                />
                <span>Technique</span>
              </label>
              <p className="section-hint text-small">
                Même logique que pour le canal.
              </p>
            </div>
          </details>

          <details className="filter-accordion">
            <summary className="filter-accordion__summary">Statut</summary>
            <div className="filter-accordion__body filter-accordion__body--checks">
              {CAMPAIGN_STATUSES.map((s) => (
                <label key={s} className="filter-check-row">
                  <input
                    type="checkbox"
                    checked={filter.statuses.has(s)}
                    onChange={() => toggleStatus(s)}
                  />
                  <span>{statusLabel(s)}</span>
                  <code className="code-inline filter-check-row__code">{s}</code>
                </label>
              ))}
              <p className="section-hint text-small">
                Aucune case : tous les statuts. Sinon : campagnes dont le statut
                est coché.
              </p>
            </div>
          </details>

          <details className="filter-accordion">
            <summary className="filter-accordion__summary">Tags</summary>
            <div className="filter-accordion__body">
              <TagFilterField
                allTags={allTags}
                tokens={filter.requiredTags}
                onAdd={(tag) =>
                  setFilter((f) => ({
                    ...f,
                    requiredTags: f.requiredTags.includes(tag)
                      ? f.requiredTags
                      : [...f.requiredTags, tag],
                  }))
                }
                onRemove={(tag) =>
                  setFilter((f) => ({
                    ...f,
                    requiredTags: f.requiredTags.filter((x) => x !== tag),
                  }))
                }
              />
            </div>
          </details>
        </div>

        <div className="filter-panel__footer">
          <button
            type="button"
            className="ghost-button"
            style={{ width: "100%" }}
            onClick={onClearAll}
          >
            Réinitialiser tout
          </button>
        </div>
      </div>
    </>
  );
}
