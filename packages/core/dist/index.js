import { getCampaignPrivacyMode, hasAnalyticsConsent, shouldSkipTrackingForCampaign, } from "./consent.js";
import { evaluateSegmentMatch } from "./segments.js";
export { getCampaignPrivacyMode, hasAnalyticsConsent, shouldSkipTrackingForCampaign, } from "./consent.js";
export { getQueryParamFirst, safeRegexTest } from "./contextHelpers.js";
export { normalizeRawSegment, evaluateRule, evaluateCondition, evaluateSegmentMatch, evaluateSegmentConditionBreakdown, summarizeOneRule, countSegmentLeaves, summarizeSegmentRules, } from "./segments.js";
export { SEGMENT_ID_MIN, SEGMENT_ID_MAX, CAMPAIGN_ID_MIN, CAMPAIGN_ID_MAX, VARIATION_SLOT_MIN, VARIATION_SLOT_MAX, isSegmentId, isCampaignId, variationIdForSlot, variationSlot, campaignIdFromVariationId, isVariationIdForCampaign, parseNumericId, } from "./ids.js";
export const noOpTracking = {
    async trackExposure() {
        // no-op by default; can be wired to Piano in production
    },
    async trackConversion() {
        // no-op by default; can be wired to Piano in production
    },
};
export function createPianoTrackingAdapter(params) {
    const { sendEvent } = params;
    return {
        async trackExposure({ campaignId, variationId, context }) {
            await sendEvent({
                type: "exposure",
                campaignId,
                variationId,
                context,
            });
        },
        async trackConversion({ campaignId, variationId, eventName, context }) {
            await sendEvent({
                type: "conversion",
                campaignId,
                variationId,
                eventName,
                context,
            });
        },
    };
}
export function isCampaignActive(campaign, now = new Date()) {
    if (campaign.status !== "running")
        return false;
    if (campaign.startDate && new Date(campaign.startDate) > now)
        return false;
    if (campaign.endDate && new Date(campaign.endDate) < now)
        return false;
    return true;
}
export function hashToBucket(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % 100;
}
export function pickVariationByTraffic(variations, bucket) {
    if (!variations.length)
        return null;
    let cumulative = 0;
    for (const variation of variations) {
        cumulative += variation.trafficAllocation;
        if (bucket < cumulative) {
            return variation;
        }
    }
    return variations[variations.length - 1] ?? null;
}
/** Extrait un id de variation « sticky » du contexte (corps `/api/evaluate`, etc.). */
export function parseAssignedVariationIdFromContext(context) {
    const raw = context.assignedVariationId;
    if (raw === undefined || raw === null)
        return undefined;
    if (typeof raw === "number" && Number.isInteger(raw))
        return raw;
    if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
        const n = Number(raw.trim());
        if (Number.isSafeInteger(n))
            return n;
    }
    return undefined;
}
export function createEngine(config) {
    const { storage, tracking, consentConfig } = config;
    async function maybeTrackExposure(input) {
        if (shouldSkipTrackingForCampaign(input.campaign))
            return;
        if (tracking) {
            await tracking.trackExposure({
                campaignId: input.campaignId,
                variationId: input.variationId,
                context: input.context,
            });
        }
    }
    async function listCampaigns() {
        return storage.listCampaigns();
    }
    async function listSegments() {
        return storage.listSegments();
    }
    async function getCampaignById(id) {
        return storage.getCampaignById(id);
    }
    async function getSegmentById(id) {
        return storage.getSegmentById(id);
    }
    async function evaluateSegmentsForContext(context) {
        const segments = await storage.listSegments();
        return segments.filter((segment) => evaluateSegmentMatch(segment, context));
    }
    async function pickVariationForCampaign(options) {
        const { campaignId, context, simulation } = options;
        const campaign = await storage.getCampaignById(campaignId);
        if (!campaign)
            return null;
        if (!isCampaignActive(campaign) && !simulation) {
            return {
                campaign,
                variation: campaign.variations[0],
                reason: "campaign_not_running",
            };
        }
        const allSegments = await storage.listSegments();
        const campaignSegments = allSegments.filter((segment) => campaign.segments.includes(segment.id));
        const hasMatchingSegment = campaignSegments.length === 0 ||
            campaignSegments.some((segment) => evaluateSegmentMatch(segment, context));
        if (!hasMatchingSegment && !simulation) {
            return {
                campaign,
                variation: campaign.variations[0],
                reason: "no_matching_segment",
            };
        }
        const measurement = getCampaignPrivacyMode(campaign) === "measurement";
        if (!simulation &&
            measurement &&
            !hasAnalyticsConsent(context, consentConfig ?? null)) {
            return {
                campaign,
                variation: campaign.variations[0],
                reason: "consent_required",
            };
        }
        if (simulation?.variationId !== undefined) {
            const variation = campaign.variations.find((v) => v.id === simulation.variationId);
            if (variation) {
                await maybeTrackExposure({
                    campaign,
                    campaignId,
                    variationId: variation.id,
                    context,
                });
                return { campaign, variation, reason: "forced_simulation" };
            }
        }
        const stickyId = parseAssignedVariationIdFromContext(context);
        if (stickyId !== undefined) {
            const stickyVariation = campaign.variations.find((v) => v.id === stickyId);
            if (stickyVariation) {
                await maybeTrackExposure({
                    campaign,
                    campaignId,
                    variationId: stickyVariation.id,
                    context,
                });
                return {
                    campaign,
                    variation: stickyVariation,
                    reason: "by_sticky_assignment",
                };
            }
        }
        const userId = context.userId ?? "anonymous";
        const seed = `${campaign.id}:${userId}`;
        const bucket = hashToBucket(seed);
        const variation = pickVariationByTraffic(campaign.variations, bucket);
        if (!variation) {
            return {
                campaign,
                variation: campaign.variations[0],
                reason: "no_variation",
            };
        }
        await maybeTrackExposure({
            campaign,
            campaignId,
            variationId: variation.id,
            context,
        });
        return { campaign, variation, reason: "by_bucket" };
    }
    return {
        listCampaigns,
        listSegments,
        getCampaignById,
        getSegmentById,
        evaluateSegmentsForContext,
        pickVariationForCampaign,
    };
}
