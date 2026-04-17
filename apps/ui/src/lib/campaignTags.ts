import type { CampaignConfig } from "@abtest-solution/core";

/** Tags normalisés (minuscules, dédupliqués). */
export function parseTagsFromCommaInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]+/)) {
    const t = part.trim().toLowerCase();
    if (!t || t.length > 64) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length > 32) break;
  }
  return out;
}

export function formatTagsAsCommaInput(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return tags.join(", ");
}

export function collectAllCampaignTags(campaigns: CampaignConfig[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of campaigns) {
    for (const t of c.tags ?? []) {
      const k = t.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  out.sort((a, b) => a.localeCompare(b, "fr"));
  return out;
}

