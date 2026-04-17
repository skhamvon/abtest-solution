/** Réponse alignée sur `GET /api/consent-config`. */
export type ConsentConfigApi = {
  stored: {
    domain: string;
    acceptanceCookie: {
      name: string;
      value: string;
    };
  };
  effective: {
    guardActive: boolean;
    domain: string | null;
    acceptanceCookie: {
      name: string;
      value: string;
    };
  };
};

/**
 * Transforme un domaine de cookie (ex. `.example.com`) en URL de base https.
 */
export function consentDomainToBaseUrl(domain: string | null | undefined): string | null {
  const d = domain?.trim();
  if (!d) return null;
  const host = d.startsWith(".") ? d.slice(1) : d;
  if (!host) return null;
  return `https://${host}/`;
}

/**
 * `simulationBaseUrl` sur la campagne prime ; sinon domaine de configuration (effectif puis fichier).
 */
export function resolveSimulationBaseUrl(
  campaign: { simulationBaseUrl?: string },
  consent: ConsentConfigApi | null,
): string | null {
  const raw = campaign.simulationBaseUrl?.trim();
  if (raw) {
    return raw;
  }
  const eff = consent?.effective.domain?.trim();
  if (eff) {
    return consentDomainToBaseUrl(eff);
  }
  const stored = consent?.stored.domain?.trim();
  return consentDomainToBaseUrl(stored ?? undefined);
}

export function buildSimulationHref(
  baseResolved: string | null,
  campaignId: number,
): { href: string; clickable: boolean } {
  const params = new URLSearchParams();
  params.set("ab_campaign_id", String(campaignId));
  params.set("ab_simulation", "1");
  const queryOnly = `?${params.toString()}`;
  if (!baseResolved?.trim()) {
    return { href: queryOnly, clickable: false };
  }
  try {
    let urlStr = baseResolved.trim();
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = `https://${urlStr}`;
    }
    const u = new URL(urlStr);
    u.searchParams.set("ab_campaign_id", String(campaignId));
    u.searchParams.set("ab_simulation", "1");
    return { href: u.toString(), clickable: true };
  } catch {
    return { href: queryOnly, clickable: false };
  }
}
