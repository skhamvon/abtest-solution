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
export { getCampaignPrivacyMode, hasAnalyticsConsent, shouldSkipTrackingForCampaign, } from "./consent.js";
export { getQueryParamFirst, safeRegexTest } from "./contextHelpers.js";
export type { SegmentRule, SegmentCondition, SegmentConfig, SegmentConfigInput, SegmentConditionBreakdownNode, SegmentRuleBreakdownLeaf, } from "./segments.js";
export { normalizeRawSegment, evaluateRule, evaluateCondition, evaluateSegmentMatch, evaluateSegmentConditionBreakdown, summarizeOneRule, countSegmentLeaves, summarizeSegmentRules, } from "./segments.js";
export { SEGMENT_ID_MIN, SEGMENT_ID_MAX, CAMPAIGN_ID_MIN, CAMPAIGN_ID_MAX, VARIATION_SLOT_MIN, VARIATION_SLOT_MAX, isSegmentId, isCampaignId, variationIdForSlot, variationSlot, campaignIdFromVariationId, isVariationIdForCampaign, parseNumericId, } from "./ids.js";
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
export declare const noOpTracking: TrackingPort;
export declare function createPianoTrackingAdapter(params: {
    sendEvent: (payload: {
        type: "exposure" | "conversion";
        campaignId: number;
        variationId: number;
        eventName?: string;
        context: UserContext;
    }) => Promise<void>;
}): TrackingPort;
export interface EngineConfig {
    storage: StoragePort;
    tracking?: TrackingPort;
    consentConfig?: AnalyticsConsentConfig | null;
}
export interface EvaluatedVariation {
    campaign: CampaignConfig;
    variation: VariationConfig;
    reason: "by_bucket" | "by_sticky_assignment" | "forced_simulation" | "campaign_not_running" | "no_matching_segment" | "no_variation" | "consent_required";
}
export declare function isCampaignActive(campaign: CampaignConfig, now?: Date): boolean;
export declare function hashToBucket(seed: string): number;
export declare function pickVariationByTraffic(variations: VariationConfig[], bucket: number): VariationConfig | null;
/** Extrait un id de variation « sticky » du contexte (corps `/api/evaluate`, etc.). */
export declare function parseAssignedVariationIdFromContext(context: UserContext): number | undefined;
export declare function createEngine(config: EngineConfig): {
    listCampaigns: () => Promise<CampaignConfig[]>;
    listSegments: () => Promise<SegmentConfig[]>;
    getCampaignById: (id: number) => Promise<CampaignConfig | null>;
    getSegmentById: (id: number) => Promise<SegmentConfig | null>;
    evaluateSegmentsForContext: (context: UserContext) => Promise<SegmentConfig[]>;
    pickVariationForCampaign: (options: {
        campaignId: number;
        context: UserContext;
        simulation?: {
            variationId?: number;
        } | null;
    }) => Promise<{
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "campaign_not_running";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "no_matching_segment";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "consent_required";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "forced_simulation";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "by_sticky_assignment";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "no_variation";
    } | {
        campaign: CampaignConfig;
        variation: VariationConfig;
        reason: "by_bucket";
    } | null>;
};
//# sourceMappingURL=index.d.ts.map