export type CampaignStatus = "draft" | "running" | "paused" | "stopped";
export type CampaignType = "frontend" | "backend";
export interface VariationConfig {
    id: string;
    name: string;
    trafficAllocation: number;
    jsPath?: string;
    cssPath?: string;
    featureFlags?: Record<string, boolean>;
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
export declare const noOpTracking: TrackingPort;
export declare function createPianoTrackingAdapter(params: {
    sendEvent: (payload: {
        type: "exposure" | "conversion";
        campaignId: string;
        variationId: string;
        eventName?: string;
        context: UserContext;
    }) => Promise<void>;
}): TrackingPort;
export interface EngineConfig {
    storage: StoragePort;
    tracking?: TrackingPort;
}
export interface EvaluatedVariation {
    campaign: CampaignConfig;
    variation: VariationConfig;
    reason: "by_bucket" | "forced_simulation" | "campaign_not_running" | "no_matching_segment" | "no_variation";
}
export declare function isCampaignActive(campaign: CampaignConfig, now?: Date): boolean;
export declare function evaluateSegmentMatch(segment: SegmentConfig, context: UserContext): boolean;
export declare function hashToBucket(seed: string): number;
export declare function pickVariationByTraffic(variations: VariationConfig[], bucket: number): VariationConfig | null;
export declare function createEngine(config: EngineConfig): {
    listCampaigns: () => Promise<CampaignConfig[]>;
    listSegments: () => Promise<SegmentConfig[]>;
    getCampaignById: (id: string) => Promise<CampaignConfig | null>;
    getSegmentById: (id: string) => Promise<SegmentConfig | null>;
    evaluateSegmentsForContext: (context: UserContext) => Promise<SegmentConfig[]>;
    pickVariationForCampaign: (options: {
        campaignId: string;
        context: UserContext;
        simulation?: {
            variationId?: string;
        } | null;
    }) => Promise<EvaluatedVariation | null>;
};
//# sourceMappingURL=index.d.ts.map