export type CampaignPrivacyMode = "measurement" | "technical";

export interface AnalyticsConsentConfig {
  cookieName: string;
  cookieValue: string;
}

export function getCampaignPrivacyMode(campaign: {
  privacyMode?: CampaignPrivacyMode;
}): CampaignPrivacyMode {
  return campaign.privacyMode ?? "measurement";
}

/** Campagne technique : jamais d’exposition trackée, même avec consentement. */
export function shouldSkipTrackingForCampaign(campaign: {
  privacyMode?: CampaignPrivacyMode;
}): boolean {
  return getCampaignPrivacyMode(campaign) === "technical";
}

/**
 * Si la config est absente ou sans nom de cookie, pas de garde-fou (comportement historique).
 */
export function hasAnalyticsConsent(
  context: { cookies?: Record<string, string> },
  config: AnalyticsConsentConfig | null | undefined,
): boolean {
  if (!config?.cookieName?.trim()) return true;
  const v = context.cookies?.[config.cookieName.trim()];
  return v === config.cookieValue;
}
