export type CampaignStatus = "draft" | "running" | "paused" | "stopped";

export type CampaignType = "frontend" | "backend";

export interface VariationConfig {
  id: string;
  name: string;
  trafficAllocation: number; // 0–100, total across variations should be 100
  // For frontend campaigns
  jsPath?: string;
  cssPath?: string;
  // For backend campaigns
  featureFlags?: Record<string, boolean>;
  // Optional Piano event identifiers
  pianoEventKey?: string;
}

export interface CampaignConfig {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  segments: string[];
  variations: VariationConfig[];
  simulationBaseUrl?: string;
}

export interface SegmentCriteria {
  country?: string[];
  device?: ("desktop" | "mobile" | "tablet")[];
  loggedIn?: boolean;
  routePrefix?: string[];
  [key: string]: unknown;
}

export interface SegmentConfig {
  id: string;
  name: string;
  description?: string;
  criteria: SegmentCriteria;
}

export interface UserContext {
  userId?: string;
  country?: string;
  device?: "desktop" | "mobile" | "tablet";
  loggedIn?: boolean;
  route?: string;
  [key: string]: unknown;
}

export interface StoragePort {
  listCampaigns(): Promise<CampaignConfig[]>;
  getCampaignById(id: string): Promise<CampaignConfig | null>;
  listSegments(): Promise<SegmentConfig[]>;
  getSegmentById(id: string): Promise<SegmentConfig | null>;
}

export interface TrackingPort {
  trackExposure(input: {
    campaignId: string;
    variationId: string;
    context: UserContext;
  }): Promise<void>;
  trackConversion(input: {
    campaignId: string;
    variationId: string;
    eventName: string;
    context: UserContext;
  }): Promise<void>;
}

export const noOpTracking: TrackingPort = {
  async trackExposure() {
    // no-op by default; can be wired to Piano in production
  },
  async trackConversion() {
    // no-op by default; can be wired to Piano in production
  },
};

export function createPianoTrackingAdapter(params: {
  sendEvent: (payload: {
    type: "exposure" | "conversion";
    campaignId: string;
    variationId: string;
    eventName?: string;
    context: UserContext;
  }) => Promise<void>;
}): TrackingPort {
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

export interface EngineConfig {
  storage: StoragePort;
  tracking?: TrackingPort;
}

export interface EvaluatedVariation {
  campaign: CampaignConfig;
  variation: VariationConfig;
  reason:
    | "by_bucket"
    | "forced_simulation"
    | "campaign_not_running"
    | "no_matching_segment"
    | "no_variation";
}

export function isCampaignActive(
  campaign: CampaignConfig,
  now: Date = new Date(),
): boolean {
  if (campaign.status !== "running") return false;
  if (campaign.startDate && new Date(campaign.startDate) > now) return false;
  if (campaign.endDate && new Date(campaign.endDate) < now) return false;
  return true;
}

export function evaluateSegmentMatch(
  segment: SegmentConfig,
  context: UserContext,
): boolean {
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

export function hashToBucket(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

export function pickVariationByTraffic(
  variations: VariationConfig[],
  bucket: number,
): VariationConfig | null {
  if (!variations.length) return null;
  let cumulative = 0;
  for (const variation of variations) {
    cumulative += variation.trafficAllocation;
    if (bucket < cumulative) {
      return variation;
    }
  }
  return variations[variations.length - 1] ?? null;
}

export function createEngine(config: EngineConfig) {
  const { storage, tracking } = config;

  async function listCampaigns() {
    return storage.listCampaigns();
  }

  async function listSegments() {
    return storage.listSegments();
  }

  async function getCampaignById(id: string) {
    return storage.getCampaignById(id);
  }

  async function getSegmentById(id: string) {
    return storage.getSegmentById(id);
  }

  async function evaluateSegmentsForContext(
    context: UserContext,
  ): Promise<SegmentConfig[]> {
    const segments = await storage.listSegments();
    return segments.filter((segment) =>
      evaluateSegmentMatch(segment, context),
    );
  }

  async function pickVariationForCampaign(options: {
    campaignId: string;
    context: UserContext;
    simulation?: { variationId?: string } | null;
  }): Promise<EvaluatedVariation | null> {
    const { campaignId, context, simulation } = options;
    const campaign = await storage.getCampaignById(campaignId);
    if (!campaign) return null;

    if (!isCampaignActive(campaign) && !simulation) {
      return { campaign, variation: campaign.variations[0]!, reason: "campaign_not_running" };
    }

    const allSegments = await storage.listSegments();
    const campaignSegments = allSegments.filter((segment) =>
      campaign.segments.includes(segment.id),
    );
    const hasMatchingSegment =
      campaignSegments.length === 0 ||
      campaignSegments.some((segment) =>
        evaluateSegmentMatch(segment, context),
      );

    if (!hasMatchingSegment && !simulation) {
      return {
        campaign,
        variation: campaign.variations[0]!,
        reason: "no_matching_segment",
      };
    }

    if (simulation?.variationId) {
      const variation = campaign.variations.find(
        (v) => v.id === simulation.variationId,
      );
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
      return { campaign, variation: campaign.variations[0]!, reason: "no_variation" };
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

