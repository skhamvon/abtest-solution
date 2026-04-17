import {
  getCampaignPrivacyMode,
  hasAnalyticsConsent,
  shouldSkipTrackingForCampaign,
} from "./consent.js";
import { evaluateSegmentMatch } from "./segments.js";
import type { UserContext } from "./context.js";
import type { AnalyticsConsentConfig, CampaignPrivacyMode } from "./consent.js";
import type { SegmentConfig } from "./segments.js";

export type CampaignStatus = "draft" | "running" | "paused" | "stopped";
export type CampaignType = "frontend" | "backend";

export interface VariationConfig {
  id: number;
  name: string;
  trafficAllocation: number;
  jsPath?: string;
  cssPath?: string;
  featureFlags?: Record<string, boolean>;
  pianoEventKey?: string;
}

export interface CampaignConfig {
  id: number;
  name: string;
  type: CampaignType;
  /** `measurement` (défaut) : soumis au consentement analytics. `technical` : toujours éligible, sans tracking. */
  privacyMode?: CampaignPrivacyMode;
  status: CampaignStatus;
  /** ISO 8601 — défini à la création (API) ou absent pour les anciennes fiches. */
  createdAt?: string;
  /** ISO 8601 — première fois que le statut devient `running` (mise en ligne). */
  firstPublishedAt?: string;
  /** ISO 8601 — dernière modification du statut. */
  lastStatusChangeAt?: string;
  startDate?: string;
  endDate?: string;
  segments: number[];
  variations: VariationConfig[];
  simulationBaseUrl?: string;
  /**
   * Campagne `frontend` : JS/CSS chargés pour **toutes** les variations (y compris la contrôle),
   * avant les assets propres à la variante retournée par le moteur.
   */
  sharedJsPath?: string;
  sharedCssPath?: string;
  /** Étiquettes libres (filtrage dans l’UI) ; chaînes courtes, ex. `["lab","promo"]`. */
  tags?: string[];
  /** Note libre pour l’équipe (admin UI) ; absent si non renseignée. */
  description?: string;
}

export type { UserContext } from "./context.js";
export type { AnalyticsConsentConfig, CampaignPrivacyMode } from "./consent.js";
export {
  getCampaignPrivacyMode,
  hasAnalyticsConsent,
  shouldSkipTrackingForCampaign,
} from "./consent.js";
export { getQueryParamFirst, safeRegexTest } from "./contextHelpers.js";
export type {
  SegmentRule,
  SegmentCondition,
  SegmentConfig,
  SegmentConfigInput,
  SegmentConditionBreakdownNode,
  SegmentRuleBreakdownLeaf,
} from "./segments.js";
export {
  normalizeRawSegment,
  evaluateRule,
  evaluateCondition,
  evaluateSegmentMatch,
  evaluateSegmentConditionBreakdown,
  summarizeOneRule,
  countSegmentLeaves,
  summarizeSegmentRules,
} from "./segments.js";
export {
  SEGMENT_ID_MIN,
  SEGMENT_ID_MAX,
  CAMPAIGN_ID_MIN,
  CAMPAIGN_ID_MAX,
  VARIATION_SLOT_MIN,
  VARIATION_SLOT_MAX,
  isSegmentId,
  isCampaignId,
  variationIdForSlot,
  variationSlot,
  campaignIdFromVariationId,
  isVariationIdForCampaign,
  parseNumericId,
} from "./ids.js";

export interface StoragePort {
  listCampaigns(): Promise<CampaignConfig[]>;
  getCampaignById(id: number): Promise<CampaignConfig | null>;
  listSegments(): Promise<SegmentConfig[]>;
  getSegmentById(id: number): Promise<SegmentConfig | null>;
}

export interface TrackingPort {
  trackExposure(input: {
    campaignId: number;
    variationId: number;
    context: UserContext;
  }): Promise<void>;
  trackConversion(input: {
    campaignId: number;
    variationId: number;
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
    campaignId: number;
    variationId: number;
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
  consentConfig?: AnalyticsConsentConfig | null;
}

export interface EvaluatedVariation {
  campaign: CampaignConfig;
  variation: VariationConfig;
  reason:
    | "by_bucket"
    | "by_sticky_assignment"
    | "forced_simulation"
    | "campaign_not_running"
    | "no_matching_segment"
    | "no_variation"
    | "consent_required";
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

/** Extrait un id de variation « sticky » du contexte (corps `/api/evaluate`, etc.). */
export function parseAssignedVariationIdFromContext(
  context: UserContext,
): number | undefined {
  const raw = context.assignedVariationId;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isSafeInteger(n)) return n;
  }
  return undefined;
}

export function createEngine(config: EngineConfig) {
  const { storage, tracking, consentConfig } = config;

  async function maybeTrackExposure(input: {
    campaign: CampaignConfig;
    campaignId: number;
    variationId: number;
    context: UserContext;
  }) {
    if (shouldSkipTrackingForCampaign(input.campaign)) return;
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

  async function getCampaignById(id: number) {
    return storage.getCampaignById(id);
  }

  async function getSegmentById(id: number) {
    return storage.getSegmentById(id);
  }

  async function evaluateSegmentsForContext(context: UserContext) {
    const segments = await storage.listSegments();
    return segments.filter((segment) => evaluateSegmentMatch(segment, context));
  }

  async function pickVariationForCampaign(options: {
    campaignId: number;
    context: UserContext;
    simulation?: {
      variationId?: number;
    } | null;
  }) {
    const { campaignId, context, simulation } = options;
    const campaign = await storage.getCampaignById(campaignId);
    if (!campaign) return null;

    if (!isCampaignActive(campaign) && !simulation) {
      return {
        campaign,
        variation: campaign.variations[0],
        reason: "campaign_not_running" as const,
      };
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
        variation: campaign.variations[0],
        reason: "no_matching_segment" as const,
      };
    }

    const measurement = getCampaignPrivacyMode(campaign) === "measurement";
    if (
      !simulation &&
      measurement &&
      !hasAnalyticsConsent(context, consentConfig ?? null)
    ) {
      return {
        campaign,
        variation: campaign.variations[0],
        reason: "consent_required" as const,
      };
    }

    if (simulation?.variationId !== undefined) {
      const variation = campaign.variations.find(
        (v) => v.id === simulation.variationId,
      );
      if (variation) {
        await maybeTrackExposure({
          campaign,
          campaignId,
          variationId: variation.id,
          context,
        });
        return { campaign, variation, reason: "forced_simulation" as const };
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
          reason: "by_sticky_assignment" as const,
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
        reason: "no_variation" as const,
      };
    }

    await maybeTrackExposure({
      campaign,
      campaignId,
      variationId: variation.id,
      context,
    });
    return { campaign, variation, reason: "by_bucket" as const };
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
