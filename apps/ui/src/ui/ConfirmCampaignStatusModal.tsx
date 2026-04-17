import type { StatusChangePending } from "@/campaignStatusOptions";

type Props = {
  pending: StatusChangePending | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmCampaignStatusModal({
  pending,
  saving,
  error,
  onCancel,
  onConfirm,
}: Props) {
  if (!pending) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <div className="modal-panel">
        <h3 id="status-confirm-title">Confirmer le changement de statut</h3>
        <p style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          Campagne <strong>{pending.name}</strong> : passer de{" "}
          <code className="code-inline">{pending.previous}</code> à{" "}
          <code className="code-inline">{pending.next}</code> ?
        </p>
        {error ? (
          <p className="diag-error" style={{ marginBottom: "0.75rem" }}>
            {error}
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
            disabled={saving}
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={saving}
            onClick={() => void onConfirm()}
          >
            {saving ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
