import type { CampaignConfig } from "@abtest-solution/core";

export function countRunningCampaigns(campaigns: CampaignConfig[]): number {
  return campaigns.filter((c) => c.status === "running").length;
}

/** Variante dont le nom correspond à la contrôle (insensible à la casse). */
export function isOriginalVariationName(name: string): boolean {
  return /^original$/i.test(name.trim());
}

/**
 * Campagnes où la ou les variation(s) avec la plus forte allocation de trafic
 * ne sont pas nommées « Original » (proxy config — pas de résultat d’A/B stocké).
 */
export function countCampaignsLeadingVariantNotOriginal(
  campaigns: CampaignConfig[],
): number {
  return campaigns.filter((c) => {
    if (c.variations.length === 0) return false;
    const max = Math.max(...c.variations.map((v) => v.trafficAllocation));
    const leaders = c.variations.filter((v) => v.trafficAllocation === max);
    return leaders.some((v) => !isOriginalVariationName(v.name ?? ""));
  }).length;
}
