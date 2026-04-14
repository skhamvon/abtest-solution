/** Segments : entiers 1000–9999 (JSON number). */
export const SEGMENT_ID_MIN = 1000;
export const SEGMENT_ID_MAX = 9999;

/** Campagnes : entiers 10000–99999 (JSON number). */
export const CAMPAIGN_ID_MIN = 10000;
export const CAMPAIGN_ID_MAX = 99999;

/** Variation = campaignId × 10 + slot, slot 0–9 (0 = contrôle). */
export const VARIATION_SLOT_MIN = 0;
export const VARIATION_SLOT_MAX = 9;

export function isSegmentId(id: number): boolean {
  return (
    Number.isInteger(id) && id >= SEGMENT_ID_MIN && id <= SEGMENT_ID_MAX
  );
}

export function isCampaignId(id: number): boolean {
  return (
    Number.isInteger(id) && id >= CAMPAIGN_ID_MIN && id <= CAMPAIGN_ID_MAX
  );
}

export function variationIdForSlot(campaignId: number, slot: number): number {
  if (!isCampaignId(campaignId)) {
    throw new Error(`Invalid campaignId: ${campaignId}`);
  }
  if (
    !Number.isInteger(slot) ||
    slot < VARIATION_SLOT_MIN ||
    slot > VARIATION_SLOT_MAX
  ) {
    throw new Error(`Invalid variation slot: ${slot}`);
  }
  return campaignId * 10 + slot;
}

export function variationSlot(variationId: number): number {
  return variationId % 10;
}

export function campaignIdFromVariationId(variationId: number): number {
  return Math.floor(variationId / 10);
}

export function isVariationIdForCampaign(
  variationId: number,
  campaignId: number,
): boolean {
  if (!isCampaignId(campaignId)) return false;
  const v = variationIdForSlot(campaignId, 0);
  return variationId >= v && variationId <= v + VARIATION_SLOT_MAX;
}

/** Parse un id depuis param URL / chaîne utilisateur. */
export function parseNumericId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}
