import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  variationSlot,
  type CampaignConfig,
} from "@abtest-solution/core";
import { API_BASE } from "@/apiBase";
import type { CampaignOutletContext } from "./campaignOutletContext";

function canMutateVariationStructure(c: CampaignConfig): boolean {
  return c.status === "draft" && c.firstPublishedAt == null;
}

function nextFreeExperimentSlot(
  variations: { id: number }[],
): number | null {
  const used = new Set(variations.map((v) => variationSlot(v.id)));
  for (let s = 1; s <= 9; s += 1) {
    if (!used.has(s)) return s;
  }
  return null;
}

export function CampaignVariationsPage() {
  const { campaign, setCampaign } = useOutletContext<CampaignOutletContext>();

  const canMutate = useMemo(
    () => canMutateVariationStructure(campaign),
    [campaign],
  );
  const canAdd = useMemo(
    () => canMutate && nextFreeExperimentSlot(campaign.variations) !== null,
    [canMutate, campaign.variations],
  );

  /** Original (slot 0) ne compte pas pour le minimum de variations supprimables. */
  const experimentalVariationCount = useMemo(
    () =>
      campaign.variations.filter((v) => variationSlot(v.id) !== 0).length,
    [campaign.variations],
  );

  const [namesDraft, setNamesDraft] = useState<Record<number, string>>({});
  const [renameBusyId, setRenameBusyId] = useState<number | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const variationsSorted = useMemo(
    () => [...campaign.variations].sort((a, b) => a.id - b.id),
    [campaign.variations],
  );

  function nameDraftFor(id: number, fallback: string): string {
    if (Object.prototype.hasOwnProperty.call(namesDraft, id)) {
      return namesDraft[id] ?? "";
    }
    return fallback;
  }

  function setNameDraft(id: number, value: string) {
    setNamesDraft((prev) => ({ ...prev, [id]: value }));
  }

  async function saveRename(variationId: number) {
    const raw = nameDraftFor(
      variationId,
      campaign.variations.find((v) => v.id === variationId)?.name ?? "",
    ).trim();
    if (!raw) {
      setRenameError("Le nom ne peut pas être vide.");
      return;
    }
    setRenameBusyId(variationId);
    setRenameError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/campaigns/${campaign.id}/variations/${variationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: raw }),
        },
      );
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setNamesDraft((prev) => {
        const next = { ...prev };
        delete next[variationId];
        return next;
      });
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setRenameBusyId(null);
    }
  }

  async function createVariation() {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload =
        newName.trim() !== "" ? { name: newName.trim() } : undefined;
      const res = await fetch(
        `${API_BASE}/api/campaigns/${campaign.id}/variations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
        },
      );
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setNewName("");
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }

  async function deleteVariation(variationId: number) {
    setDeleteBusyId(variationId);
    setDeleteError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/campaigns/${campaign.id}/variations/${variationId}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as { error?: string } & CampaignConfig;
      if (!res.ok) {
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setCampaign(body);
      setNamesDraft((prev) => {
        const next = { ...prev };
        delete next[variationId];
        return next;
      });
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <div className="campaign-variations">
      <p className="section-hint text-small" style={{ marginBottom: "1rem" }}>
        Renommez les libellés des variations d’expérimentation à tout moment (le
        libellé <strong>Original</strong> est figé).{" "}
        <strong>Ajouter</strong> ou <strong>supprimer</strong> une variation n’est
        possible qu’en <strong>brouillon</strong> et tant que la campagne n’a pas
        été mise en ligne une première fois. Pour la suppression,{" "}
        <strong>Original</strong> (slot 0) ne compte pas : il doit rester au moins
        une autre variation d’expérimentation.
      </p>
      {!canMutate ? (
        <p className="section-hint text-small" style={{ marginBottom: "1rem" }}>
          Cette campagne n’est plus modifiable sur la structure des variations.
        </p>
      ) : null}

      <section className="campaign-section" aria-labelledby="camp-var-create">
        <h3 id="camp-var-create" className="subsection-title">
          Nouvelle variation
        </h3>
        <div
          className="inline-row"
          style={{ marginBottom: "0.5rem", maxWidth: "42rem", flexWrap: "wrap" }}
        >
          <input
            className="field-input"
            style={{ flex: "1 1 14rem" }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom optionnel (ex. Bandeau bleu)"
            maxLength={200}
            disabled={!canAdd || createBusy}
            aria-label="Nom de la nouvelle variation"
          />
          <button
            type="button"
            className="primary-button"
            disabled={!canAdd || createBusy}
            onClick={() => void createVariation()}
          >
            {createBusy ? "Création…" : "Créer une variation"}
          </button>
        </div>
        {!canAdd && canMutate ? (
          <p className="text-small muted">
            Slots de variation saturés (maximum 10 variations par campagne).
          </p>
        ) : null}
        {createError ? (
          <p className="diag-error" style={{ marginBottom: "0.75rem" }}>
            {createError}
          </p>
        ) : null}
      </section>

      <section className="campaign-section" aria-labelledby="camp-var-list">
        <h3 id="camp-var-list" className="subsection-title">
          Variations
        </h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>ID</th>
                <th>Nom</th>
                <th aria-label="Actions"> </th>
              </tr>
            </thead>
            <tbody>
              {variationsSorted.map((v) => {
                const slot = variationSlot(v.id);
                const isControl = slot === 0;
                const canDeleteThis =
                  canMutate &&
                  !isControl &&
                  experimentalVariationCount > 1;
                return (
                  <tr key={v.id}>
                    <td>{slot}</td>
                    <td>
                      <code className="code-inline">{v.id}</code>
                    </td>
                    <td>
                      <input
                        className="field-input"
                        value={nameDraftFor(v.id, v.name)}
                        onChange={(e) => setNameDraft(v.id, e.target.value)}
                        maxLength={200}
                        disabled={isControl}
                        aria-label={`Nom variation ${v.id}`}
                        title={
                          isControl
                            ? "Le nom Original (contrôle) n’est pas modifiable ici."
                            : undefined
                        }
                      />
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className="primary-button"
                          disabled={isControl || renameBusyId !== null}
                          onClick={() => void saveRename(v.id)}
                        >
                          {renameBusyId === v.id ? "…" : "Enregistrer"}
                        </button>
                        <button
                          type="button"
                          className="primary-button primary-button--danger"
                          disabled={!canDeleteThis || deleteBusyId !== null}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Supprimer la variation « ${v.name} » (slot ${slot}) ? Les fichiers variant-${slot}/ seront supprimés du dépôt.`,
                              )
                            ) {
                              void deleteVariation(v.id);
                            }
                          }}
                        >
                          {deleteBusyId === v.id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {renameError ? (
          <p className="diag-error" style={{ marginTop: "0.75rem" }}>
            {renameError}
          </p>
        ) : null}
        {deleteError ? (
          <p className="diag-error" style={{ marginTop: "0.75rem" }}>
            {deleteError}
          </p>
        ) : null}
        <p className="section-hint text-small" style={{ marginTop: "0.75rem" }}>
          Pensez à rééquilibrer les pourcentages dans l’onglet{" "}
          <strong>Allocation du trafic et segments</strong> après ajout ou
          suppression.
        </p>
      </section>
    </div>
  );
}
