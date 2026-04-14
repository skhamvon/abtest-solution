const LS_KEY = "abtest_visitor_id";
const COOKIE_NAME = "abtest_vid";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function writeVisitorCookie(value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(COOKIE_NAME)}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

function randomVisitorId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vid_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function persistVisitorId(id: string): void {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* quota / mode privé */
  }
  writeVisitorCookie(id);
}

/**
 * Identifiant persistant par navigateur, utilisé comme `context.userId` pour le bucketing.
 * Priorité : localStorage, puis cookie miroir, sinon génération.
 */
export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromLs = localStorage.getItem(LS_KEY);
    if (fromLs?.trim()) return fromLs.trim();
  } catch {
    /* ignore */
  }
  const fromCookie = readCookie(COOKIE_NAME)?.trim();
  if (fromCookie && fromCookie.length <= 255) {
    persistVisitorId(fromCookie);
    return fromCookie;
  }
  const id = randomVisitorId();
  persistVisitorId(id);
  return id;
}

/**
 * À appeler après login (ou fusion d'identité) : remplace l'id anonyme.
 * Mieux vaut l'appeler avant la première exposition si le bucket doit suivre le compte.
 */
export function setAbtestVisitorId(id: string): void {
  const t = id.trim();
  if (!t || t.length > 255) return;
  persistVisitorId(t);
}
