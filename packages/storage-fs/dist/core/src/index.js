"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noOpTracking = void 0;
exports.createPianoTrackingAdapter = createPianoTrackingAdapter;
exports.isCampaignActive = isCampaignActive;
exports.evaluateSegmentMatch = evaluateSegmentMatch;
exports.hashToBucket = hashToBucket;
exports.pickVariationByTraffic = pickVariationByTraffic;
exports.createEngine = createEngine;
exports.noOpTracking = {
    async trackExposure() {
        // no-op by default; can be wired to Piano in production
    },
    async trackConversion() {
        // no-op by default; can be wired to Piano in production
    },
};
function createPianoTrackingAdapter(params) {
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
function isCampaignActive(campaign, now = new Date()) {
    if (campaign.status !== "running")
        return false;
    if (campaign.startDate && new Date(campaign.startDate) > now)
        return false;
    if (campaign.endDate && new Date(campaign.endDate) < now)
        return false;
    return true;
}
function evaluateSegmentMatch(segment, context) {
    const { criteria } = segment;
    if (criteria.country && criteria.country.length > 0) {
        if (!context.country || !criteria.country.includes(context.country)) {
            return false;
        }
    }
    if (criteria.device && criteria.device.length > 0) {
        if (!context.device || !criteria.device.includes(context.device)) {
            return false;
        }
    }
    if (typeof criteria.loggedIn === "boolean") {
        if (context.loggedIn !== criteria.loggedIn) {
            return false;
        }
    }
    if (criteria.routePrefix && criteria.routePrefix.length > 0) {
        const route = context.route || "";
        if (!criteria.routePrefix.some((prefix) => route.startsWith(prefix))) {
            return false;
        }
    }
    return true;
}
function hashToBucket(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % 100;
}
function pickVariationByTraffic(variations, bucket) {
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
function createEngine(config) {
    const { storage, tracking } = config;
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
            return { campaign, variation: campaign.variations[0], reason: "campaign_not_running" };
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
        if (simulation?.variationId) {
            const variation = campaign.variations.find((v) => v.id === simulation.variationId);
            if (variation) {
                if (tracking) {
                    await tracking.trackExposure({
                        campaignId,
                        variationId: variation.id,
                        context,
                    });
                }
                return { campaign, variation, reason: "forced_simulation" };
            }
        }
        const userId = context.userId ?? "anonymous";
        const seed = `${campaign.id}:${userId}`;
        const bucket = hashToBucket(seed);
        const variation = pickVariationByTraffic(campaign.variations, bucket);
        if (!variation) {
            return { campaign, variation: campaign.variations[0], reason: "no_variation" };
        }
        if (tracking) {
            await tracking.trackExposure({
                campaignId,
                variationId: variation.id,
                context,
            });
        }
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
