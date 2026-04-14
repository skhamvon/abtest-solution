import type { UserContext } from "./context.js";
import { getQueryParamFirst, safeRegexTest } from "./contextHelpers.js";

export type SegmentRule =
  | {
      type: "country";
      operator: "isAnyOf";
      values: string[];
    }
  | {
      type: "device";
      operator: "isAnyOf";
      values: ("desktop" | "mobile" | "tablet")[];
    }
  | {
      type: "loggedIn";
      operator: "equals";
      value: boolean;
    }
  | {
      type: "url";
      operator:
        | "equals"
        | "contains"
        | "startsWith"
        | "endsWith"
        | "matchesRegex";
      value: string;
      /** Si `true`, compare sur `origin + pathname` (URL absolue) ou chemin seul sans query / fragment. */
      ignoreQueryString?: boolean;
    }
  | {
      type: "queryParam";
      name: string;
      operator: "exists";
    }
  | {
      type: "queryParam";
      name: string;
      operator: "equals" | "contains" | "matchesRegex";
      value: string;
    }
  | {
      type: "screen";
      operator:
        | "widthAtLeast"
        | "widthAtMost"
        | "heightAtLeast"
        | "heightAtMost";
      value: number;
    }
  | {
      type: "region";
      operator: "isAnyOf";
      values: string[];
    }
  | {
      type: "city";
      operator: "isAnyOf";
      values: string[];
    }
  | {
      type: "city";
      operator: "contains";
      value: string;
    }
  | {
      type: "browser";
      operator: "isAnyOf";
      values: string[];
    }
  | {
      type: "browserVersion";
      operator: "equals" | "olderThan" | "newerThan";
      value: string;
    }
  | {
      type: "browserLanguage";
      operator: "isAnyOf";
      values: string[];
    }
  | {
      type: "customRule";
      ruleId: string;
    }
  | {
      type: "dom";
      operator: "exists";
      presenceKey: string;
    }
  | {
      type: "cookie";
      name: string;
      operator: "exists";
    }
  | {
      type: "cookie";
      name: string;
      operator: "equals" | "contains";
      value: string;
    }
  | {
      type: "visitorType";
      operator: "equals";
      value: "new" | "returning";
    };

/**
 * Condition booléenne : feuille (`SegmentRule`) ou combinaison ET / OU / NON.
 * `allOf` : toutes les sous-conditions doivent être vraies (ET).
 * `anyOf` : au moins une sous-condition doit être vraie (OU).
 * `not` : la sous-condition doit être fausse (négation).
 */
export type SegmentCondition =
  | SegmentRule
  | { type: "allOf"; conditions: SegmentCondition[] }
  | { type: "anyOf"; conditions: SegmentCondition[] }
  | { type: "not"; condition: SegmentCondition };

/** Segment normalisé consommé par le moteur (toujours `condition`). */
export interface SegmentConfig {
  id: number;
  name: string;
  description?: string;
  condition: SegmentCondition;
}

/** Entrée avant normalisation (fichier ou API). */
export interface SegmentConfigInput {
  id: number;
  name: string;
  description?: string;
  /** Arbre ET/OU/NON ; **exclusif** avec `rules` au niveau fichier (validé par `storage-fs`). */
  condition?: SegmentCondition;
  /** Liste plate (ET implicite), équivalent à `{ type: "allOf", conditions: rules }`. Utiliser `[]` pour un segment universel. **Exclusif** avec `condition`. */
  rules?: SegmentRule[];
}

function normalizeToCondition(input: SegmentConfigInput): SegmentCondition {
  if (input.condition !== undefined) {
    return input.condition;
  }
  if (input.rules !== undefined) {
    return { type: "allOf", conditions: input.rules };
  }
  throw new Error("SegmentConfigInput: fournir `condition` ou `rules`");
}

export function normalizeRawSegment(input: SegmentConfigInput): SegmentConfig {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    condition: normalizeToCondition(input),
  };
}

function effectiveUrl(context: UserContext): string {
  if (context.url && context.url.length > 0) return context.url;
  const route = context.route ?? "";
  const qs = context.queryParams;
  if (!qs || Object.keys(qs).length === 0) return route;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${route}?${q}` : route;
}

function stripQueryAndFragment(s: string): string {
  const noHash = s.split("#")[0] ?? s;
  return noHash.split("?")[0] ?? noHash;
}

/**
 * Chaîne utilisée pour les règles `url`. Avec `ignoreQueryString`, URL absolue → `origin` + `pathname` (API URL) ;
 * sinon chemin seul sans query/fragment (`url` relative ou `route`).
 */
function urlComparableString(
  context: UserContext,
  ignoreQueryString: boolean,
): string {
  if (!ignoreQueryString) {
    return effectiveUrl(context);
  }
  const raw = context.url && context.url.length > 0 ? context.url : null;
  if (raw !== null && /^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return `${u.origin}${u.pathname}`;
    } catch {
      return stripQueryAndFragment(raw);
    }
  }
  if (raw !== null) {
    return stripQueryAndFragment(raw);
  }
  return stripQueryAndFragment(context.route ?? "");
}

function matchesBrowserLanguage(lang: string | undefined, allowed: string[]) {
  if (!lang) return false;
  const l = lang.toLowerCase();
  return allowed.some((a) => {
    const al = a.toLowerCase();
    return l === al || l.startsWith(`${al}-`);
  });
}

/** Parties numériques (séquences de chiffres séparées par tout non-chiffre). */
function browserVersionNumericParts(version: string): number[] {
  const parts = version.split(/[^0-9]+/).filter((s) => s.length > 0);
  return parts.map((s) => {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

/**
 * Comparaison type semver simplifiée sur les segments numériques.
 * Retourne `null` si une des chaînes n’a aucun segment numérique.
 */
function compareBrowserVersions(a: string, b: string): number | null {
  const pa = browserVersionNumericParts(a);
  const pb = browserVersionNumericParts(b);
  if (pa.length === 0 || pb.length === 0) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

export function evaluateRule(rule: SegmentRule, context: UserContext): boolean {
  switch (rule.type) {
    case "country":
      return !!context.country && rule.values.includes(context.country);
    case "device":
      return !!context.device && rule.values.includes(context.device);
    case "loggedIn":
      return context.loggedIn === rule.value;
    case "url": {
      const u = urlComparableString(context, rule.ignoreQueryString === true);
      switch (rule.operator) {
        case "equals":
          return u === rule.value;
        case "contains":
          return u.includes(rule.value);
        case "startsWith":
          return u.startsWith(rule.value);
        case "endsWith":
          return u.endsWith(rule.value);
        case "matchesRegex":
          return safeRegexTest(rule.value, u);
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "queryParam": {
      const raw = getQueryParamFirst(context.queryParams, rule.name);
      switch (rule.operator) {
        case "exists":
          return raw !== undefined && raw !== "";
        case "equals":
          return raw === rule.value;
        case "contains":
          return raw !== undefined && raw.includes(rule.value);
        case "matchesRegex":
          return raw !== undefined && safeRegexTest(rule.value, raw);
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "screen": {
      switch (rule.operator) {
        case "widthAtLeast":
          return (
            context.screenWidth !== undefined &&
            context.screenWidth >= rule.value
          );
        case "widthAtMost":
          return (
            context.screenWidth !== undefined &&
            context.screenWidth <= rule.value
          );
        case "heightAtLeast":
          return (
            context.screenHeight !== undefined &&
            context.screenHeight >= rule.value
          );
        case "heightAtMost":
          return (
            context.screenHeight !== undefined &&
            context.screenHeight <= rule.value
          );
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "region":
      return !!context.region && rule.values.includes(context.region);
    case "city":
      if (rule.operator === "contains") {
        const c = context.city;
        return !!c && c.includes(rule.value);
      }
      return !!context.city && rule.values.includes(context.city);
    case "browser": {
      const b = context.browser?.toLowerCase();
      if (!b) return false;
      return rule.values.some((v) => v.toLowerCase() === b);
    }
    case "browserVersion": {
      const v = context.browserVersion ?? "";
      if (!v) return false;
      switch (rule.operator) {
        case "equals":
          return v === rule.value;
        case "olderThan": {
          const c = compareBrowserVersions(v, rule.value);
          return c !== null && c < 0;
        }
        case "newerThan": {
          const c = compareBrowserVersions(v, rule.value);
          return c !== null && c > 0;
        }
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "browserLanguage":
      return matchesBrowserLanguage(context.browserLanguage, rule.values);
    case "customRule":
      return context.customRuleResults?.[rule.ruleId] === true;
    case "dom":
      return context.domPresence?.[rule.presenceKey] === true;
    case "cookie": {
      const jar = context.cookies;
      switch (rule.operator) {
        case "exists":
          return (
            jar !== undefined &&
            Object.prototype.hasOwnProperty.call(jar, rule.name)
          );
        case "equals":
          return jar?.[rule.name] === rule.value;
        case "contains":
          return jar?.[rule.name]?.includes(rule.value) === true;
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "visitorType":
      return context.visitorType === rule.value;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export function evaluateCondition(
  condition: SegmentCondition,
  context: UserContext,
): boolean {
  if (condition.type === "allOf") {
    if (condition.conditions.length === 0) return true;
    return condition.conditions.every((c) => evaluateCondition(c, context));
  }
  if (condition.type === "anyOf") {
    if (condition.conditions.length === 0) return false;
    return condition.conditions.some((c) => evaluateCondition(c, context));
  }
  if (condition.type === "not") {
    return !evaluateCondition(condition.condition, context);
  }
  return evaluateRule(condition, context);
}

export function evaluateSegmentMatch(
  segment: SegmentConfig,
  context: UserContext,
): boolean {
  return evaluateCondition(segment.condition, context);
}

export function summarizeOneRule(rule: SegmentRule): string {
  switch (rule.type) {
    case "country":
      return `pays ∈ {${rule.values.join(", ")}}`;
    case "device":
      return `device ∈ {${rule.values.join(", ")}}`;
    case "loggedIn":
      return `connecté=${rule.value}`;
    case "url": {
      const suffix = rule.ignoreQueryString ? " [sans query]" : "";
      return `url ${rule.operator} "${rule.value}"${suffix}`;
    }
    case "queryParam":
      return rule.operator === "exists"
        ? `param ${rule.name} existe`
        : `param ${rule.name} ${rule.operator} "${rule.value}"`;
    case "screen":
      return `écran ${rule.operator} ${rule.value}`;
    case "region":
      return `région ∈ {${rule.values.join(", ")}}`;
    case "city":
      return rule.operator === "contains"
        ? `ville contient "${rule.value}"`
        : `ville ∈ {${rule.values.join(", ")}}`;
    case "browser":
      return `navigateur ∈ {${rule.values.join(", ")}}`;
    case "browserVersion":
      return `version ${rule.operator} "${rule.value}"`;
    case "browserLanguage":
      return `langue ∈ {${rule.values.join(", ")}}`;
    case "customRule":
      return `custom:${rule.ruleId}`;
    case "dom":
      return `DOM[${rule.presenceKey}]`;
    case "cookie":
      return rule.operator === "exists"
        ? `cookie ${rule.name} existe`
        : `cookie ${rule.name} ${rule.operator} "${rule.value}"`;
    case "visitorType":
      return `visiteur=${rule.value}`;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** Nœud d’arbre de diagnostic (critère attendu vs valeur actuelle du contexte). */
export type SegmentConditionBreakdownNode =
  | SegmentRuleBreakdownLeaf
  | {
      kind: "allOf";
      matches: boolean;
      children: SegmentConditionBreakdownNode[];
    }
  | {
      kind: "anyOf";
      matches: boolean;
      children: SegmentConditionBreakdownNode[];
    }
  | {
      kind: "not";
      matches: boolean;
      child: SegmentConditionBreakdownNode;
    };

export interface SegmentRuleBreakdownLeaf {
  kind: "rule";
  expected: string;
  actual: string;
  matches: boolean;
}

const MISSING = "— (non fourni)";

function describeRuleActual(rule: SegmentRule, context: UserContext): string {
  switch (rule.type) {
    case "country":
      return context.country ?? MISSING;
    case "device":
      return context.device ?? MISSING;
    case "loggedIn":
      return context.loggedIn === undefined
        ? "— (non défini)"
        : String(context.loggedIn);
    case "url": {
      const u = urlComparableString(context, rule.ignoreQueryString === true);
      return u.length > 0 ? u : MISSING;
    }
    case "queryParam": {
      const raw = getQueryParamFirst(context.queryParams, rule.name);
      if (rule.operator === "exists") {
        if (raw === undefined) return "(paramètre absent)";
        if (raw === "") return '"" (vide)';
        return `"${raw}"`;
      }
      return raw === undefined ? "(paramètre absent)" : `"${raw}"`;
    }
    case "screen": {
      switch (rule.operator) {
        case "widthAtLeast":
        case "widthAtMost":
          return context.screenWidth !== undefined
            ? `largeur ${String(context.screenWidth)}px`
            : MISSING;
        case "heightAtLeast":
        case "heightAtMost":
          return context.screenHeight !== undefined
            ? `hauteur ${String(context.screenHeight)}px`
            : MISSING;
        default: {
          const _e: never = rule;
          return _e;
        }
      }
    }
    case "region":
      return context.region ?? MISSING;
    case "city":
      return context.city ?? MISSING;
    case "browser":
      return context.browser ?? MISSING;
    case "browserVersion":
      return context.browserVersion && context.browserVersion.length > 0
        ? context.browserVersion
        : MISSING;
    case "browserLanguage":
      return context.browserLanguage ?? MISSING;
    case "customRule": {
      const r = context.customRuleResults?.[rule.ruleId];
      if (r === true) return "true (customRuleResults)";
      if (r === false) return "false (customRuleResults)";
      return "— (customRuleResults absent ou clé manquante)";
    }
    case "dom": {
      const v = context.domPresence?.[rule.presenceKey];
      if (v === true) return "présent (domPresence)";
      if (v === false) return "absent (domPresence)";
      return "— (domPresence absent ou clé manquante)";
    }
    case "cookie": {
      const jar = context.cookies;
      if (jar === undefined) return "— (cookies non fournis)";
      if (!Object.prototype.hasOwnProperty.call(jar, rule.name)) {
        return `(cookie « ${rule.name} » absent)`;
      }
      const val = jar[rule.name];
      if (rule.operator === "exists") return `présent (« ${val} »)`;
      return val ?? "";
    }
    case "visitorType":
      return context.visitorType ?? MISSING;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/**
 * Détail critère par critère, aligné sur {@link evaluateCondition} / {@link evaluateRule}.
 */
export function evaluateSegmentConditionBreakdown(
  condition: SegmentCondition,
  context: UserContext,
): SegmentConditionBreakdownNode {
  if (condition.type === "allOf") {
    const children = condition.conditions.map((c) =>
      evaluateSegmentConditionBreakdown(c, context),
    );
    const matches =
      condition.conditions.length === 0 ||
      children.every((ch) => ch.matches);
    return { kind: "allOf", matches, children };
  }
  if (condition.type === "anyOf") {
    const children = condition.conditions.map((c) =>
      evaluateSegmentConditionBreakdown(c, context),
    );
    const matches =
      condition.conditions.length > 0 &&
      children.some((ch) => ch.matches);
    return { kind: "anyOf", matches, children };
  }
  if (condition.type === "not") {
    const child = evaluateSegmentConditionBreakdown(
      condition.condition,
      context,
    );
    return { kind: "not", matches: !child.matches, child };
  }
  const matches = evaluateRule(condition, context);
  return {
    kind: "rule",
    expected: summarizeOneRule(condition),
    actual: describeRuleActual(condition, context),
    matches,
  };
}

/** Nombre de règles feuilles (pour affichage / stats). */
export function countSegmentLeaves(condition: SegmentCondition): number {
  if (condition.type === "allOf" || condition.type === "anyOf") {
    return condition.conditions.reduce(
      (n, c) => n + countSegmentLeaves(c),
      0,
    );
  }
  if (condition.type === "not") {
    return countSegmentLeaves(condition.condition);
  }
  return 1;
}

function flattenSummaries(condition: SegmentCondition): string[] {
  if (condition.type === "allOf") {
    if (condition.conditions.length === 0) return ["(tous)"];
    if (condition.conditions.length === 1) {
      return flattenSummaries(condition.conditions[0]!);
    }
    return condition.conditions.flatMap((sub, i) => [
      ...(i > 0 ? ["— ET —"] : []),
      ...flattenSummaries(sub).map((s) => `  ${s}`),
    ]);
  }
  if (condition.type === "anyOf") {
    if (condition.conditions.length === 0) {
      return ["(aucune branche OU — jamais vrai)"];
    }
    if (condition.conditions.length === 1) {
      return flattenSummaries(condition.conditions[0]!);
    }
    return condition.conditions.flatMap((sub, i) => [
      ...(i > 0 ? ["— OU —"] : []),
      ...flattenSummaries(sub).map((s) => `  ${s}`),
    ]);
  }
  if (condition.type === "not") {
    return [
      "— NON —",
      ...flattenSummaries(condition.condition).map((s) => `  ${s}`),
    ];
  }
  return [summarizeOneRule(condition)];
}

export function summarizeSegmentRules(segment: SegmentConfig): string[] {
  return flattenSummaries(segment.condition);
}
