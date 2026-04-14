import type { UserContext } from "@abtest-solution/core";
import { getOrCreateVisitorId } from "./visitorId";

export type DomSelectorMap = Record<string, string>;
export type CustomRuleEvaluators = Record<string, () => boolean>;

export const defaultDemoDomSelectors: DomSelectorMap = {};

export const defaultDemoCustomRules: CustomRuleEvaluators = {};

export const RETURNING_VISITOR_COOKIE_NAME = "abtest_returning";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function parseCookies(): Record<string, string> {
  if (typeof document === "undefined" || !document.cookie) return {};
  const out: Record<string, string> = {};
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(rest.join("=") ?? "");
  }
  return out;
}

function queryParamsFromSearch(): Record<string, string | string[]> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const out: Record<string, string | string[]> = {};
  for (const key of sp.keys()) {
    const all = sp.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? "") : all;
  }
  return out;
}

/**
 * Contexte enrichi pour `/api/evaluate` depuis le navigateur.
 */
export function buildBrowserEvaluateContext(opts?: {
  domSelectors?: DomSelectorMap;
  customRules?: CustomRuleEvaluators;
}): UserContext {
  const domSelectors = { ...defaultDemoDomSelectors, ...opts?.domSelectors };
  const customRules = { ...defaultDemoCustomRules, ...opts?.customRules };

  const domPresence: Record<string, boolean> = {};
  for (const [key, selector] of Object.entries(domSelectors)) {
    try {
      domPresence[key] = !!document.querySelector(selector);
    } catch {
      domPresence[key] = false;
    }
  }

  const customRuleResults: Record<string, boolean> = {};
  for (const [ruleId, fn] of Object.entries(customRules)) {
    try {
      customRuleResults[ruleId] = fn() === true;
    } catch {
      customRuleResults[ruleId] = false;
    }
  }

  const hadReturningCookie =
    readCookie(RETURNING_VISITOR_COOKIE_NAME) === "1";
  if (!hadReturningCookie && typeof document !== "undefined") {
    document.cookie = `${RETURNING_VISITOR_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let device: UserContext["device"];
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    device = /iPad|Tablet/i.test(ua) ? "tablet" : "mobile";
  } else {
    device = "desktop";
  }

  return {
    device,
    route: typeof window !== "undefined" ? window.location.pathname : "",
    url: typeof window !== "undefined" ? window.location.href : "",
    queryParams: queryParamsFromSearch(),
    screenWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
    screenHeight:
      typeof window !== "undefined" ? window.innerHeight : undefined,
    browserLanguage:
      typeof navigator !== "undefined" ? navigator.language : undefined,
    cookies: parseCookies(),
    domPresence,
    customRuleResults,
    visitorType: hadReturningCookie ? "returning" : "new",
    ...(typeof window !== "undefined" ? { userId: getOrCreateVisitorId() } : {}),
  };
}
