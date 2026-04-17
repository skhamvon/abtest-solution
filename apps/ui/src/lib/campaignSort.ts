import {
  getCampaignPrivacyMode,
  type CampaignConfig,
} from "@abtest-solution/core";
import type { SortDir } from "./sortTypes";

export type CampaignSortKey =
  | "name"
  | "type"
  | "privacy"
  | "status"
  | "createdAt"
  | "firstPublishedAt"
  | "lastStatusChangeAt";

function isoMs(s: string | undefined): number {
  if (!s) return Number.NaN;
  const t = Date.parse(s);
  return Number.isNaN(t) ? Number.NaN : t;
}

export function compareCampaigns(
  a: CampaignConfig,
  b: CampaignConfig,
  key: CampaignSortKey,
  dir: SortDir,
): number {
  const m = dir === "asc" ? 1 : -1;
  switch (key) {
    case "name":
      return m * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    case "type":
      return m * a.type.localeCompare(b.type);
    case "privacy":
      return (
        m *
        getCampaignPrivacyMode(a).localeCompare(getCampaignPrivacyMode(b))
      );
    case "status":
      return m * a.status.localeCompare(b.status);
    case "createdAt":
    case "firstPublishedAt":
    case "lastStatusChangeAt": {
      const va = isoMs(a[key as "createdAt" | "firstPublishedAt" | "lastStatusChangeAt"]);
      const vb = isoMs(b[key as "createdAt" | "firstPublishedAt" | "lastStatusChangeAt"]);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return m * (va - vb);
    }
    default:
      return 0;
  }
}

export function sortCampaigns(
  list: CampaignConfig[],
  key: CampaignSortKey,
  dir: SortDir,
): CampaignConfig[] {
  return [...list].sort((a, b) => compareCampaigns(a, b, key, dir));
}
