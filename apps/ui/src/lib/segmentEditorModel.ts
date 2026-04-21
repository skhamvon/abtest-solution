import type { SegmentCondition, SegmentRule } from "@abtest-solution/core";

/** Indices depuis la racine ; `"n"` descend dans l’unique enfant d’un `not`. */
export type PathSeg = number | "n";
export type Path = PathSeg[];

export function defaultRootCondition(): SegmentCondition {
  return { type: "allOf", conditions: [] };
}

export function cloneCondition(c: SegmentCondition): SegmentCondition {
  return JSON.parse(JSON.stringify(c)) as SegmentCondition;
}

export function normalizeRootForEditor(c: SegmentCondition): SegmentCondition {
  const copy = cloneCondition(c);
  if (copy.type === "allOf" || copy.type === "anyOf") return copy;
  return { type: "allOf", conditions: [copy] };
}

export function getNodeAtPath(
  root: SegmentCondition,
  path: Path,
): SegmentCondition | null {
  let node: SegmentCondition = root;
  for (const seg of path) {
    if (seg === "n") {
      if (node.type !== "not") return null;
      node = node.condition;
    } else {
      if (node.type !== "allOf" && node.type !== "anyOf") return null;
      if (seg < 0 || seg >= node.conditions.length) return null;
      node = node.conditions[seg]!;
    }
  }
  return node;
}

function getParentRef(
  root: SegmentCondition,
  path: Path,
): { parent: SegmentCondition; segment: PathSeg } | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1]!;
  const parent = getNodeAtPath(root, parentPath);
  if (!parent) return null;
  return { parent, segment: last };
}

export function removeNodeAtPath(
  root: SegmentCondition,
  path: Path,
): SegmentCondition {
  const next = cloneCondition(root);
  if (path.length === 0) return next;
  const ref = getParentRef(next, path);
  if (!ref) return next;
  const { parent, segment } = ref;
  if (segment === "n") {
    if (parent.type !== "not") return next;
    return removeNodeAtPath(next, path.slice(0, -1));
  }
  if (parent.type !== "allOf" && parent.type !== "anyOf") return next;
  parent.conditions.splice(segment, 1);
  return next;
}

export function replaceNodeAtPath(
  root: SegmentCondition,
  path: Path,
  node: SegmentCondition,
): SegmentCondition {
  const next = cloneCondition(root);
  if (path.length === 0) return node;
  const ref = getParentRef(next, path);
  if (!ref) return next;
  const { parent, segment } = ref;
  if (segment === "n") {
    if (parent.type !== "not") return next;
    parent.condition = node;
    return next;
  }
  if (parent.type !== "allOf" && parent.type !== "anyOf") return next;
  parent.conditions[segment] = node;
  return next;
}

export function appendToContainer(
  root: SegmentCondition,
  containerPath: Path,
  child: SegmentCondition,
): SegmentCondition {
  const next = cloneCondition(root);
  let node = getNodeAtPath(next, containerPath);
  if (!node) return next;
  if (node.type === "not") {
    node = node.condition;
  }
  if (node.type !== "allOf" && node.type !== "anyOf") return next;
  node.conditions.push(child);
  return next;
}

/** MIME pour `dataTransfer` (glisser-déposer éditeur de segment). */
export const SEGMENT_EDITOR_DND_MIME =
  "application/x+abtest-segment-editor+dnd+v1";

/**
 * Clé secondaire sans `+` : certains navigateurs n’exposent pas le type
 * principal dans `dataTransfer.types` pendant `dragover`, ou `types` est un
 * `DOMStringList` sans `.includes()`.
 */
export const SEGMENT_EDITOR_DND_MIME_FALLBACK =
  "text/x-abtest-segment-editor-dnd-v1";

/** Liste des types annoncés pendant un drag (compatible DOMStringList). */
export function dataTransferTypeStrings(dt: DataTransfer): string[] {
  const types = dt.types;
  if (!types) return [];
  if (Array.isArray(types)) return [...types];
  try {
    if (typeof (types as Iterable<string>)[Symbol.iterator] === "function") {
      return Array.from(types as Iterable<string>);
    }
  } catch {
    /* ignore */
  }
  const n = types.length;
  if (typeof n !== "number" || n < 0) return [];
  const out: string[] = [];
  const list = types as DOMStringList;
  for (let i = 0; i < n; i++) {
    const t =
      typeof list.item === "function" ? list.item(i) : (types as unknown as string[])[i];
    if (typeof t === "string" && t.length) out.push(t);
  }
  return out;
}

/** Indique si le drag vient de la palette ou de l’arbre de l’éditeur de segment. */
export function dataTransferHasSegmentEditorDnd(dt: DataTransfer): boolean {
  const want = new Set([
    SEGMENT_EDITOR_DND_MIME.toLowerCase(),
    SEGMENT_EDITOR_DND_MIME_FALLBACK.toLowerCase(),
  ]);
  for (const t of dataTransferTypeStrings(dt)) {
    if (want.has(t.toLowerCase())) return true;
  }
  return false;
}

/** Lit le JSON de charge utile DnD (clé principale puis repli). */
export function readSegmentEditorDndJson(dt: DataTransfer): string | null {
  for (const key of [SEGMENT_EDITOR_DND_MIME, SEGMENT_EDITOR_DND_MIME_FALLBACK]) {
    try {
      const s = dt.getData(key);
      if (s?.trim()) return s;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export type SegmentEditorDndPayload =
  | { source: "palette"; kind: RulePaletteKind }
  | { source: "tree"; path: Path };

function isStrictPrefix(short: Path, long: Path): boolean {
  if (long.length <= short.length) return false;
  return short.every((seg, i) => long[i] === seg);
}

/** Insère une sous-condition dans un groupe (ou sous le `condition` d’un `not`). */
export function insertChildAtIndex(
  root: SegmentCondition,
  containerPath: Path,
  child: SegmentCondition,
  insertBefore: number,
): SegmentCondition {
  const next = cloneCondition(root);
  let target = getNodeAtPath(next, containerPath);
  if (!target) return next;
  if (target.type === "not") target = target.condition;
  if (target.type !== "allOf" && target.type !== "anyOf") return next;
  const idx = Math.max(0, Math.min(insertBefore, target.conditions.length));
  target.conditions.splice(idx, 0, child);
  return next;
}

/**
 * Déplace un sous-arbre vers un groupe à l’index `insertBefore` (0 = début).
 * Interdit : racine, déposer dans un descendant du nœud déplacé.
 */
export function moveSubtreeToIndex(
  root: SegmentCondition,
  fromPath: Path,
  toContainerPath: Path,
  insertBefore: number,
): SegmentCondition {
  if (fromPath.length === 0) return cloneCondition(root);
  const next = cloneCondition(root);
  const moving = getNodeAtPath(next, fromPath);
  if (!moving) return next;
  if (pathsEqual(fromPath, toContainerPath)) return next;
  if (isStrictPrefix(fromPath, toContainerPath)) return next;

  const fromLast = fromPath[fromPath.length - 1]!;
  if (typeof fromLast !== "number") return next;

  const fromParentPath = fromPath.slice(0, -1);
  const fromParent = getNodeAtPath(next, fromParentPath);
  if (!fromParent || (fromParent.type !== "allOf" && fromParent.type !== "anyOf"))
    return next;

  let target = getNodeAtPath(next, toContainerPath);
  if (!target) return next;
  if (target.type === "not") target = target.condition;
  if (target.type !== "allOf" && target.type !== "anyOf") return next;

  const [removed] = fromParent.conditions.splice(fromLast, 1);

  let insertIndex = insertBefore;
  if (pathsEqual(fromParentPath, toContainerPath) && fromLast < insertBefore) {
    insertIndex = insertBefore - 1;
  }
  insertIndex = Math.max(0, Math.min(insertIndex, target.conditions.length));
  target.conditions.splice(insertIndex, 0, removed);
  return next;
}

export function toggleGroupKindAtPath(
  root: SegmentCondition,
  path: Path,
): SegmentCondition {
  const next = cloneCondition(root);
  const node = getNodeAtPath(next, path);
  if (!node || (node.type !== "allOf" && node.type !== "anyOf")) return next;
  if (node.type === "allOf") {
    (node as { type: string }).type = "anyOf";
  } else {
    (node as { type: string }).type = "allOf";
  }
  return next;
}

export function wrapInNotAtPath(
  root: SegmentCondition,
  path: Path,
): SegmentCondition {
  const next = cloneCondition(root);
  const target = getNodeAtPath(next, path);
  if (!target) return next;
  const wrapped: SegmentCondition = {
    type: "not",
    condition: cloneCondition(target),
  };
  return replaceNodeAtPath(next, path, wrapped);
}

/** Retire un nœud `not` en conservant son unique sous-arbre à la même place. */
export function unwrapNotAtPath(
  root: SegmentCondition,
  notPath: Path,
): SegmentCondition {
  const next = cloneCondition(root);
  const notNode = getNodeAtPath(next, notPath);
  if (!notNode || notNode.type !== "not") return next;
  return replaceNodeAtPath(next, notPath, cloneCondition(notNode.condition));
}

export function setGroupKindAtPath(
  root: SegmentCondition,
  path: Path,
  kind: "allOf" | "anyOf",
): SegmentCondition {
  const next = cloneCondition(root);
  const node = getNodeAtPath(next, path);
  if (!node || (node.type !== "allOf" && node.type !== "anyOf")) return next;
  if (node.type === kind) return next;
  (node as { type: string }).type = kind;
  return next;
}

export function addChildGroup(
  root: SegmentCondition,
  containerPath: Path,
  kind: "allOf" | "anyOf",
): SegmentCondition {
  const child: SegmentCondition = { type: kind, conditions: [] };
  return appendToContainer(root, containerPath, child);
}

export type RulePaletteKind = SegmentRule["type"];

export type RulePaletteItem = { kind: RulePaletteKind; label: string };

/**
 * Même regroupement que la doc « Types de segment » (segment-types.md) :
 * URL et navigation → utilisateur → navigateur → critères techniques.
 */
export const RULE_PALETTE_GROUPS: { heading: string; items: RulePaletteItem[] }[] =
  [
    {
      heading: "URL et navigation",
      items: [
        { kind: "url", label: "URL" },
        { kind: "queryParam", label: "Paramètre d’URL" },
      ],
    },
    {
      heading: "Caractéristiques de l’utilisateur",
      items: [
        { kind: "country", label: "Pays" },
        { kind: "region", label: "Région" },
        { kind: "city", label: "Ville" },
        { kind: "device", label: "Appareil" },
        { kind: "loggedIn", label: "Connecté" },
        { kind: "visitorType", label: "Type de visiteur" },
      ],
    },
    {
      heading: "Caractéristiques du navigateur",
      items: [
        { kind: "browser", label: "Navigateur" },
        { kind: "browserVersion", label: "Version navigateur" },
        { kind: "browserLanguage", label: "Langue navigateur" },
        { kind: "screen", label: "Écran" },
      ],
    },
    {
      heading: "Critères techniques",
      items: [
        { kind: "customRule", label: "Règle custom" },
        { kind: "dom", label: "DOM" },
        { kind: "cookie", label: "Cookie" },
      ],
    },
  ];

/** Liste plate (ordre doc), utile pour vérifications / itérations globales. */
export const RULE_PALETTE: RulePaletteItem[] = RULE_PALETTE_GROUPS.flatMap(
  (g) => g.items,
);

export function createDefaultLeaf(kind: RulePaletteKind): SegmentRule {
  switch (kind) {
    case "country":
      return { type: "country", operator: "isAnyOf", values: ["FR"] };
    case "device":
      return { type: "device", operator: "isAnyOf", values: ["desktop"] };
    case "loggedIn":
      return { type: "loggedIn", operator: "equals", value: true };
    case "url":
      return {
        type: "url",
        operator: "contains",
        value: "/",
        ignoreQueryString: false,
      };
    case "queryParam":
      return { type: "queryParam", name: "utm_source", operator: "exists" };
    case "screen":
      return { type: "screen", operator: "widthAtLeast", value: 768 };
    case "region":
      return { type: "region", operator: "isAnyOf", values: ["IDF"] };
    case "city":
      return { type: "city", operator: "isAnyOf", values: ["Paris"] };
    case "browser":
      return { type: "browser", operator: "isAnyOf", values: ["chrome"] };
    case "browserVersion":
      return {
        type: "browserVersion",
        operator: "equals",
        value: "120",
      };
    case "browserLanguage":
      return {
        type: "browserLanguage",
        operator: "isAnyOf",
        values: ["fr"],
      };
    case "customRule":
      return { type: "customRule", ruleId: "my_custom_rule" };
    case "dom":
      return { type: "dom", operator: "exists", presenceKey: "hero" };
    case "cookie":
      return { type: "cookie", name: "session", operator: "exists" };
    case "visitorType":
      return { type: "visitorType", operator: "equals", value: "new" };
    default: {
      const _x: never = kind;
      return _x;
    }
  }
}

export function pathsEqual(a: Path, b: Path): boolean {
  if (a == null || b == null) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
