import { useEffect, useRef, useState } from "react";
import {
  CAMPAIGN_ID_MAX,
  CAMPAIGN_ID_MIN,
  type CampaignConfig,
  type CampaignPrivacyMode,
  type CampaignType,
} from "@abtest-solution/core";
import { API_BASE } from "../apiBase";

type Props = {
  open: boolean;
  campaigns: CampaignConfig[];
  onClose: () => void;
  onCreated: (campaign: CampaignConfig) => void;
};

function suggestNextCampaignId(usedIds: number[]): number | null {
  const used = new Set(usedIds);
  for (let id = CAMPAIGN_ID_MIN; id <= CAMPAIGN_ID_MAX; id++) {
    if (!used.has(id)) return id;
  }
  return null;
}

async function readApiError(res: Response): Promise<string> {
  let msg = `Erreur HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) {
      msg = body.error.trim();
      if (msg === "Campaign already exists") {
        return "Une campagne existe déjà avec ce dossier ou cet identifiant.";
      }
    }
  } catch {
    /* ignore */
  }
  return msg;
}

export function CreateCampaignModal({
  open,
  campaigns,
  onClose,
  onCreated,
}: Props) {
  const wasOpen = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [idStr, setIdStr] = useState("");
  const [type, setType] = useState<CampaignType>("frontend");
  const [privacyMode, setPrivacyMode] =
    useState<CampaignPrivacyMode>("measurement");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const nextId = suggestNextCampaignId(campaigns.map((c) => c.id));
      setName("");
      setIdStr(nextId != null ? String(nextId) : "");
      setType("frontend");
      setPrivacyMode("measurement");
      setError(null);
      setSubmitting(false);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    }
    wasOpen.current = open;
  }, [open, campaigns]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Le nom est obligatoire.");
      return;
    }

    const idNum = Number(idStr.trim());
    if (
      !Number.isInteger(idNum) ||
      idNum < CAMPAIGN_ID_MIN ||
      idNum > CAMPAIGN_ID_MAX
    ) {
      setError(
        `L’identifiant doit être un entier entre ${CAMPAIGN_ID_MIN} et ${CAMPAIGN_ID_MAX}.`,
      );
      return;
    }

    const payload: Record<string, unknown> = {
      id: idNum,
      name: trimmedName,
      type,
      privacyMode,
    };

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      const created = (await res.json()) as CampaignConfig;
      onCreated(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const nextFree = suggestNextCampaignId(campaigns.map((c) => c.id));
  const noIdAvailable = nextFree === null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        className="modal-panel modal-panel--create-campaign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-campaign-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <h3 id="create-campaign-title">Nouvelle campagne</h3>
          <p className="modal-create-campaign__lede muted text-small">
            Un dossier de campagne est créé dans le dépôt de configuration. Le
            nom lisible sert aussi de base pour le nom du dossier sur disque. La
            campagne est créée en <strong>brouillon</strong> ; le statut se gère
            ensuite depuis la liste ou la fiche.
          </p>

          <div className="modal-create-campaign__field">
            <label className="modal-create-campaign__label" htmlFor="cc-name">
              Nom
            </label>
            <input
              ref={nameInputRef}
              id="cc-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Promo été panier"
              autoComplete="off"
              disabled={submitting}
            />
          </div>

          <div className="modal-create-campaign__field">
            <label className="modal-create-campaign__label" htmlFor="cc-id">
              Identifiant métier
            </label>
            <input
              id="cc-id"
              className="field-input"
              inputMode="numeric"
              value={idStr}
              onChange={(e) => setIdStr(e.target.value)}
              placeholder={`${CAMPAIGN_ID_MIN}–${CAMPAIGN_ID_MAX}`}
              disabled={submitting || noIdAvailable}
              aria-describedby="cc-id-hint"
            />
            <p id="cc-id-hint" className="modal-create-campaign__hint text-small">
              {noIdAvailable
                ? "Aucun identifiant libre dans la plage autorisée."
                : `Valeur proposée : premier identifiant libre (${CAMPAIGN_ID_MIN}–${CAMPAIGN_ID_MAX}). Ajustez si nécessaire.`}
            </p>
          </div>

          <fieldset className="modal-create-campaign__field">
            <legend className="modal-create-campaign__label">Canal</legend>
            <div className="modal-create-campaign__radios">
              <label className="modal-create-campaign__radio">
                <input
                  type="radio"
                  name="cc-type"
                  value="frontend"
                  checked={type === "frontend"}
                  onChange={() => setType("frontend")}
                  disabled={submitting}
                />
                <span>Frontend</span>
              </label>
              <label className="modal-create-campaign__radio">
                <input
                  type="radio"
                  name="cc-type"
                  value="backend"
                  checked={type === "backend"}
                  onChange={() => setType("backend")}
                  disabled={submitting}
                />
                <span>Backend</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="modal-create-campaign__field">
            <legend className="modal-create-campaign__label">
              Confidentialité
            </legend>
            <div className="modal-create-campaign__radios">
              <label className="modal-create-campaign__radio">
                <input
                  type="radio"
                  name="cc-privacy"
                  value="measurement"
                  checked={privacyMode === "measurement"}
                  onChange={() => setPrivacyMode("measurement")}
                  disabled={submitting}
                />
                <span>Mesure (consentement analytics)</span>
              </label>
              <label className="modal-create-campaign__radio">
                <input
                  type="radio"
                  name="cc-privacy"
                  value="technical"
                  checked={privacyMode === "technical"}
                  onChange={() => setPrivacyMode("technical")}
                  disabled={submitting}
                />
                <span>Technique (hors consentement)</span>
              </label>
            </div>
            <p className="modal-create-campaign__hint text-small">
              Correspond au champ <code className="code-inline">privacyMode</code>{" "}
              dans le fichier de configuration (distinct du canal frontend/backend).
            </p>
          </fieldset>

          {error ? (
            <p className="diag-error modal-create-campaign__error">{error}</p>
          ) : null}

          <div className="modal-create-campaign__actions">
            <button
              type="button"
              className="ghost-button"
              disabled={submitting}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || noIdAvailable || !name.trim()}
            >
              {submitting ? "Création…" : "Créer la campagne"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
