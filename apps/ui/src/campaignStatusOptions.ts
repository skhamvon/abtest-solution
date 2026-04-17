import type { CampaignStatus } from "@abtest-solution/core";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "running",
  "paused",
  "stopped",
];

export type StatusChangePending = {
  campaignId: number;
  name: string;
  previous: CampaignStatus;
  next: CampaignStatus;
};
