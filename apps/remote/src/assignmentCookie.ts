/**
 * Cookie 1st-party : mémorise l’id de variation (nombre) pour une campagne.
 */
export function assignmentCookieName(campaignId: number): string {
  return `ab_var_${campaignId}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function readAssignedVariationId(
  campaignId: number,
): number | undefined {
  const raw = readCookie(assignmentCookieName(campaignId));
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

export function setAssignedVariationCookie(
  campaignId: number,
  variationId: number,
  endDateIso?: string,
): void {
  if (typeof document === "undefined") return;
  const name = assignmentCookieName(campaignId);
  const maxAgeSec = endDateIso
    ? Math.max(
        0,
        Math.floor((new Date(endDateIso).getTime() - Date.now()) / 1000),
      )
    : 60 * 60 * 24 * 30;
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(String(variationId))}`,
    "path=/",
    "SameSite=Lax",
  ];
  if (maxAgeSec > 0) {
    parts.push(`max-age=${maxAgeSec}`);
  }
  document.cookie = parts.join("; ");
}

export function clearAssignedVariationCookie(campaignId: number): void {
  if (typeof document === "undefined") return;
  const name = assignmentCookieName(campaignId);
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0`;
}
