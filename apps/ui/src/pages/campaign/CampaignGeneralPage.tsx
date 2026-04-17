import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  getCampaignPrivacyMode,
  type CampaignConfig,
  type CampaignStatus,
} from "@abtest-solution/core";
import {
  CAMPAIGN_STATUSES,
  type StatusChangePending,
} from "@/campaignStatusOptions";
import { SimulationLaunchLinks } from "@/ui/SimulationLaunchLinks";
import { ConfirmCampaignStatusModal } from "@/ui/ConfirmCampaignStatusModal";
import { API_BASE } from "@/apiBase";
import { formatCampaignInstant } from "@/lib/formatCampaignDate";
import {
  formatTagsAsCommaInput,
  parseTagsFromCommaInput,
} from "@/lib/campaignTags";
import type { CampaignOutletContext } from "./campaignOutletContext";

export function CampaignGeneralPage() {
  const { campaign, setCampaign, consentConfig } =
    useOutletContext<CampaignOutletContext>();
  const navigate = useNavigate();

  const [statusConfirm, setStatusConfirm] = useState<StatusChangePending | null>(
    null,
  );
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [tagsDraft, setTagsDraft] = useState("");
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);

  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(
    null,
  );

  const [simulationBaseDraft, setSimulationBaseDraft] = useState("");
  const [simulationSaveError, setSimulationSaveError] = useState<string | null>(
    null,
  );
  const [simulationSaving, setSimulationSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setTagsDraft(formatTagsAsCommaInput(campaign.tags));
    setTagsError(null);
    setDescriptionDraft(campaign.description ?? "");
    setDescriptionError(null);
    setSimulationBaseDraft(campaign.simulationBaseUrl ?? "");
    setSimulationSaveError(null);
  }, [campaign]);

  const canDeleteCampaign =
    campaign.status === "draft" || campaign.status === "stopped";

  async function saveTags() {
    const tags = parseTagsFromCommaInput(tagsDraft);
    setTagsSaving(true);
    setTagsError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setTagsDraft(formatTagsAsCommaInput(body.tags));
    } catch (e) {
      setTagsError((e as Error).message);
    } finally {
      setTagsSaving(false);
    }
  }

  async function saveDescription() {
    setDescriptionSaving(true);
    setDescriptionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft }),
      });
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setDescriptionDraft(body.description ?? "");
    } catch (e) {
      setDescriptionError((e as Error).message);
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function saveSimulationBaseUrl() {
    setSimulationSaving(true);
    setSimulationSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulationBaseUrl: simulationBaseDraft.trim() || null,
        }),
      });
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setSimulationBaseDraft(body.simulationBaseUrl ?? "");
    } catch (e) {
      setSimulationSaveError((e as Error).message);
    } finally {
      setSimulationSaving(false);
    }
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
      setCampaign(body);
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

  async function confirmDeleteCampaign() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        setDeleteConfirmOpen(false);
        navigate("/campaigns");
        return;
      }
      let msg = `Erreur HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (typeof body.error === "string") msg = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const selectsLocked = statusConfirm !== null || statusSaving;

  return (
    <>
      <section className="campaign-section" aria-labelledby="camp-infos-title">
        <h3 id="camp-infos-title" className="subsection-title">
          Informations
        </h3>
        <p className="detail-meta">
          <strong>ID</strong> {campaign.id} · <strong>Canal</strong>{" "}
          <span className={`type-pill type-${campaign.type}`}>
            {campaign.type === "frontend" ? "Frontend" : "Backend"}
          </span>
          {" · "}
          <strong>Confidentialité</strong>{" "}
          <span
            className={`privacy-pill privacy-${getCampaignPrivacyMode(campaign)}`}
          >
            {getCampaignPrivacyMode(campaign) === "measurement"
              ? "Mesure"
              : "Technique"}
          </span>
        </p>
        <p className="detail-meta" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <strong>Statut</strong>
          <select
            className="field-input table-status-select"
            aria-label="Statut de la campagne"
            disabled={selectsLocked}
            value={
              statusConfirm?.campaignId === campaign.id
                ? statusConfirm.previous
                : campaign.status
            }
            onChange={(e) => {
              const next = e.target.value as CampaignStatus;
              if (next === campaign.status) return;
              setStatusError(null);
              setStatusConfirm({
                campaignId: campaign.id,
                name: campaign.name,
                previous: campaign.status,
                next,
              });
            }}
          >
            {CAMPAIGN_STATUSES.map((s) => (
              <option
                key={s}
                value={s}
                disabled={
                  s === "draft" && campaign.status !== "draft"
                }
              >
                {s}
              </option>
            ))}
          </select>
        </p>
        <p className="section-hint text-small" style={{ marginBottom: "0.75rem" }}>
          <strong>Création</strong> {formatCampaignInstant(campaign.createdAt)}
          {" · "}
          <strong>1re mise en ligne</strong>{" "}
          {formatCampaignInstant(campaign.firstPublishedAt)}
          {" · "}
          <strong>Dernier changement de statut</strong>{" "}
          {formatCampaignInstant(campaign.lastStatusChangeAt)}
        </p>
      </section>

      <section className="campaign-section" aria-labelledby="camp-tags-title">
        <h3 id="camp-tags-title" className="subsection-title">
          Tags
        </h3>
        <p className="section-hint text-small">
          Mots-clés séparés par des virgules (enregistrés en minuscules dans{" "}
          <code className="code-inline">config.json</code>).
        </p>
        <div
          className="inline-row"
          style={{ marginBottom: "0.5rem", maxWidth: "42rem" }}
        >
          <input
            className="field-input"
            style={{ flex: "1 1 16rem" }}
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="ex. lab, promo, saison"
            spellCheck={false}
            aria-label="Tags de la campagne"
          />
          <button
            type="button"
            className="primary-button"
            disabled={tagsSaving}
            onClick={() => void saveTags()}
          >
            {tagsSaving ? "Enregistrement…" : "Enregistrer les tags"}
          </button>
        </div>
        {tagsError ? (
          <p className="diag-error" style={{ marginBottom: "0.75rem" }}>
            {tagsError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section" aria-labelledby="camp-desc-title">
        <h3 id="camp-desc-title" className="subsection-title">
          Description
        </h3>
        <p className="section-hint text-small">
          Note interne pour l’équipe (champ{" "}
          <code className="code-inline">description</code>, optionnel).
        </p>
        <textarea
          className="field-input campaign-description-field"
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="Contexte métier, objectifs de test, liens internes…"
          aria-label="Description de la campagne"
        />
        <p className="section-hint text-small" style={{ marginTop: "0.25rem" }}>
          {descriptionDraft.length} / 4000
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="primary-button"
            disabled={descriptionSaving}
            onClick={() => void saveDescription()}
          >
            {descriptionSaving ? "Enregistrement…" : "Enregistrer la description"}
          </button>
        </p>
        {descriptionError ? (
          <p className="diag-error" style={{ marginTop: "0.5rem" }}>
            {descriptionError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section" aria-labelledby="camp-sim-title">
        <h3 id="camp-sim-title" className="subsection-title">
          Simulation (lab)
        </h3>
        <p className="section-hint text-small">
          L’URL de base enregistrée sur la campagne prime sur le domaine défini
          sous Configuration (utilisé pour deviner un hôte si la campagne n’a pas
          d’URL dédiée).
        </p>
        <SimulationLaunchLinks campaign={campaign} consent={consentConfig} />
        <div
          className="inline-row"
          style={{ marginTop: "0.75rem", maxWidth: "40rem" }}
        >
          <label className="field-stack">
            <span className="field-label">
              URL de base pour la simulation (optionnel)
            </span>
            <input
              className="field-input"
              value={simulationBaseDraft}
              onChange={(e) => setSimulationBaseDraft(e.target.value)}
              placeholder="https://lab.example.com/page"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={simulationSaving}
            onClick={() => void saveSimulationBaseUrl()}
          >
            {simulationSaving ? "Enregistrement…" : "Enregistrer l’URL"}
          </button>
        </div>
        {simulationSaveError ? (
          <p className="diag-error" style={{ marginTop: "0.5rem" }}>
            {simulationSaveError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section campaign-section--danger" aria-labelledby="camp-del-title">
        <h3 id="camp-del-title" className="subsection-title">
          Zone sensible
        </h3>
        <p className="section-hint text-small">
          Suppression définitive du dossier campagne sur le disque. Uniquement si
          le statut est <strong>brouillon</strong> ou <strong>arrêtée</strong>.
        </p>
        <button
          type="button"
          className="campaign-delete-link"
          disabled={!canDeleteCampaign}
          title={
            canDeleteCampaign
              ? undefined
              : "Passez la campagne en brouillon ou arrêtée pour activer la suppression"
          }
          onClick={() => {
            if (!canDeleteCampaign) return;
            setDeleteError(null);
            setDeleteConfirmOpen(true);
          }}
        >
          Suppression de la campagne
        </button>
      </section>

      {deleteConfirmOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-campaign-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) {
              setDeleteConfirmOpen(false);
            }
          }}
        >
          <div className="modal-panel modal-panel--narrow">
            <h3 id="delete-campaign-title">Confirmer la suppression</h3>
            <p style={{ margin: "0.5rem 0 1rem", lineHeight: 1.5 }}>
              La campagne <strong>{campaign.name}</strong> (id{" "}
              <code className="code-inline">{campaign.id}</code>) et son dossier
              seront supprimés sans retour possible.
            </p>
            {deleteError ? (
              <p className="diag-error" style={{ marginBottom: "0.75rem" }}>
                {deleteError}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="ghost-button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary-button primary-button--danger"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteCampaign()}
              >
                {deleteBusy ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmCampaignStatusModal
        pending={statusConfirm}
        saving={statusSaving}
        error={statusError}
        onCancel={cancelStatusChange}
        onConfirm={() => void confirmStatusChange()}
      />
    </>
  );
}
