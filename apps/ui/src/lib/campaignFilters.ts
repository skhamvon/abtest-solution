import {
  getCampaignPrivacyMode,
  type CampaignConfig,
  type CampaignStatus,
} from "@abtest-solution/core";

const ALL_STATUSES: CampaignStatus[] = [
  "draft",
  "running",
  "paused",
  "stopped",
];

export type CampaignListFilterState = {
  nameSubstring: string;
  typeFrontend: boolean;
  typeBackend: boolean;
  privacyMeasurement: boolean;
  privacyTechnical: boolean;
  statuses: Set<CampaignStatus>;
  /** Tags requis (ET logique) — normalisés minuscules, doivent exister sur la campagne. */
  requiredTags: string[];
};

export function createEmptyCampaignListFilter(): CampaignListFilterState {
  return {
    nameSubstring: "",
    typeFrontend: false,
    typeBackend: false,
    privacyMeasurement: false,
    privacyTechnical: false,
    statuses: new Set(),
    requiredTags: [],
  };
}

function typeFilterPasses(
  c: CampaignConfig,
  fe: boolean,
  be: boolean,
): boolean {
  if (!fe && !be) return true;
  if (fe && be) return true;
  if (fe) return c.type === "frontend";
  return c.type === "backend";
}

function privacyFilterPasses(
  c: CampaignConfig,
  meas: boolean,
  tech: boolean,
): boolean {
  if (!meas && !tech) return true;
  if (meas && tech) return true;
  const p = getCampaignPrivacyMode(c);
  if (meas) return p === "measurement";
  return p === "technical";
}

function statusFilterPasses(
  c: CampaignConfig,
  statuses: Set<CampaignStatus>,
): boolean {
  if (statuses.size === 0) return true;
  if (statuses.size >= ALL_STATUSES.length) return true;
  return statuses.has(c.status);
}

function tagsFilterPasses(c: CampaignConfig, required: string[]): boolean {
  if (required.length === 0) return true;
  const ctags = new Set((c.tags ?? []).map((t) => t.trim().toLowerCase()));
  return required.every((t) => ctags.has(t));
}

export function campaignMatchesListFilters(
  c: CampaignConfig,
  f: CampaignListFilterState,
): boolean {
  const q = f.nameSubstring.trim().toLowerCase();
  if (q && !c.name.toLowerCase().includes(q)) return false;
  if (!typeFilterPasses(c, f.typeFrontend, f.typeBackend)) return false;
  if (
    !privacyFilterPasses(c, f.privacyMeasurement, f.privacyTechnical)
  ) {
    return false;
  }
  if (!statusFilterPasses(c, f.statuses)) return false;
  if (!tagsFilterPasses(c, f.requiredTags)) return false;
  return true;
}

export function campaignListFiltersAreActive(f: CampaignListFilterState): boolean {
  if (f.nameSubstring.trim().length > 0) return true;
  if (f.typeFrontend !== f.typeBackend) return true;
  if (f.privacyMeasurement !== f.privacyTechnical) return true;
  if (f.statuses.size > 0 && f.statuses.size < ALL_STATUSES.length) {
    return true;
  }
  if (f.requiredTags.length > 0) return true;
  return false;
}
