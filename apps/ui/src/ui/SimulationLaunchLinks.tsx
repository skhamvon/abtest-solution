import type { CampaignConfig } from "@abtest-solution/core";
import {
  buildSimulationHref,
  resolveSimulationBaseUrl,
  type ConsentConfigApi,
} from "../simulationUrl";

function openSimulation(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

export function SimulationLaunchLinks({
  campaign,
  consent,
  compact = false,
}: {
  campaign: CampaignConfig;
  consent: ConsentConfigApi | null;
  /** Liste campagnes : bouton compact */
  compact?: boolean;
}) {
  const base = resolveSimulationBaseUrl(campaign, consent);
  const { href, clickable } = buildSimulationHref(base, campaign.id);

  if (compact) {
    return (
      <span onClick={(e) => e.stopPropagation()}>
        {clickable ? (
          <button
            type="button"
            className="primary-button primary-button--compact"
            onClick={(e) => {
              e.stopPropagation();
              openSimulation(href);
            }}
          >
            Simulation
          </button>
        ) : (
          <span
            className="muted text-small"
            title="Renseignez l’URL de simulation sur la campagne ou le domaine sous Configuration"
          >
            —
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="text-small">
      {clickable ? (
        <p style={{ margin: "0 0 0.35rem" }}>
          <button
            type="button"
            className="primary-button"
            onClick={() => openSimulation(href)}
          >
            Ouvrir la page en mode simulation
          </button>
        </p>
      ) : (
        <p className="section-hint" style={{ margin: "0 0 0.35rem" }}>
          Indiquez une <strong>URL de base simulation</strong> ci-dessous ou un{" "}
          <strong>domaine</strong> sur la page Configuration pour obtenir un lien
          absolu.
        </p>
      )}
      <code className="code-inline" style={{ wordBreak: "break-all" }}>
        {href}
      </code>
    </div>
  );
}
