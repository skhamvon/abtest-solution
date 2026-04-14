import type { CampaignConfig, VariationConfig } from "@abtest-solution/core";
import { getCampaignPrivacyMode } from "@abtest-solution/core";
import { clearAssignedVariationCookie, readAssignedVariationId } from "./assignmentCookie";

const STORAGE_KEY = "abtest_assignments_v1";
const STORE_VERSION = 1;

type Entry = { variationId: number; expiresAtMs: number };

type StoreShape = { v: number; entries: Record<string, Entry> };

function shelfMsUntil(endDateIso?: string): number {
  if (!endDateIso) return 60 * 60 * 24 * 30 * 1000;
  const end = new Date(endDateIso).getTime();
  if (!Number.isFinite(end)) return 60 * 60 * 24 * 30 * 1000;
  return Math.max(0, end - Date.now());
}

function readStore(): StoreShape {
  if (typeof localStorage === "undefined") {
    return { v: STORE_VERSION, entries: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: STORE_VERSION, entries: {} };
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (parsed?.v !== STORE_VERSION || !parsed.entries || typeof parsed.entries !== "object") {
      return { v: STORE_VERSION, entries: {} };
    }
    return { v: STORE_VERSION, entries: parsed.entries as Record<string, Entry> };
  } catch {
    return { v: STORE_VERSION, entries: {} };
  }
}

function writeStore(store: StoreShape): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function pruneExpired(store: StoreShape): void {
  const now = Date.now();
  for (const k of Object.keys(store.entries)) {
    if (store.entries[k].expiresAtMs <= now) {
      delete store.entries[k];
    }
  }
}

function migrateLegacyCookieIfNeeded(campaignId: number): number | undefined {
  const legacy = readAssignedVariationId(campaignId);
  if (legacy === undefined) return undefined;
  const store = readStore();
  const key = String(campaignId);
  store.entries[key] = {
    variationId: legacy,
    expiresAtMs: Date.now() + 60 * 60 * 24 * 30 * 1000,
  };
  writeStore(store);
  clearAssignedVariationCookie(campaignId);
  return legacy;
}

export function readStoredVariationId(campaignId: number): number | undefined {
  const store = readStore();
  pruneExpired(store);
  const key = String(campaignId);
  const e = store.entries[key];
  if (e && e.expiresAtMs > Date.now()) {
    writeStore(store);
    return e.variationId;
  }
  if (e) {
    delete store.entries[key];
    writeStore(store);
  }
  return migrateLegacyCookieIfNeeded(campaignId);
}

export function clearStoredVariation(campaignId: number): void {
  const store = readStore();
  delete store.entries[String(campaignId)];
  writeStore(store);
  clearAssignedVariationCookie(campaignId);
}

export function writeStoredVariation(
  campaign: CampaignConfig,
  campaignId: number,
  variation: VariationConfig,
  reason: string,
): void {
  if (getCampaignPrivacyMode(campaign) === "technical") return;
  if (reason === "consent_required") {
    clearStoredVariation(campaignId);
    return;
  }
  const store = readStore();
  pruneExpired(store);
  store.entries[String(campaignId)] = {
    variationId: variation.id,
    expiresAtMs: Date.now() + shelfMsUntil(campaign.endDate),
  };
  writeStore(store);
  clearAssignedVariationCookie(campaignId);
}
