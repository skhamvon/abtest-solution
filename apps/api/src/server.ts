import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const apiSrcDir = path.dirname(fileURLToPath(import.meta.url));
const abtestSolutionRoot = path.resolve(apiSrcDir, "../../..");
dotenv.config({ path: path.join(abtestSolutionRoot, ".env") });
dotenv.config({ path: path.join(abtestSolutionRoot, ".env.local"), override: true });
import {
  createEngine,
  parseNumericId,
  isCampaignId,
  isSegmentId,
  SEGMENT_ID_MIN,
  SEGMENT_ID_MAX,
  variationIdForSlot,
  variationSlot,
  isVariationIdForCampaign,
  evaluateSegmentMatch,
  evaluateSegmentConditionBreakdown,
  parseAssignedVariationIdFromContext,
  type AnalyticsConsentConfig,
  type CampaignConfig,
  type UserContext,
} from "@abtest-solution/core";
import {
  createFsStorage,
  parseSegmentFileForWrite,
  segmentValidatedToDiskJson,
} from "@abtest-solution/storage-fs";

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

/** Tableau de tags normalisés (minuscules, uniques) ou `null` si invalide. */
function normalizeCampaignTagsInput(raw: unknown): string[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const t = item.trim().toLowerCase();
    if (!t || t.length > 64) return null;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length > 32) return null;
  }
  return out;
}

const ASSET_PUBLIC_ORIGIN =
  typeof process.env.ABTEST_REMOTE_PUBLIC_ORIGIN === "string" &&
  process.env.ABTEST_REMOTE_PUBLIC_ORIGIN.trim() !== ""
    ? process.env.ABTEST_REMOTE_PUBLIC_ORIGIN.trim()
    : "http://localhost:5001";

function campaignFolderSlugFromName(rawName: string): string {
  const t = rawName.trim();
  const s = t.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return s || "untitled";
}

function canMutateVariationStructure(c: CampaignConfig): boolean {
  return c.status === "draft" && c.firstPublishedAt == null;
}

async function writeFrontendSharedAssets(
  campaignDir: string,
  campaignId: number,
  folderSlug: string,
): Promise<{ sharedJsPath: string; sharedCssPath: string }> {
  const sharedDir = path.join(campaignDir, "shared");
  await fs.promises.mkdir(sharedDir, { recursive: true });
  const base = `${ASSET_PUBLIC_ORIGIN}/Campaigns/${folderSlug}`;
  await fs.promises.writeFile(
    path.join(sharedDir, "script.js"),
    `// JS commun — toutes les variations\nconsole.info('[abtest] Script commun chargé (campagne ${campaignId})');\n`,
    "utf8",
  );
  await fs.promises.writeFile(
    path.join(sharedDir, "style.css"),
    `/* CSS commun — toutes les variations */\n`,
    "utf8",
  );
  return {
    sharedJsPath: `${base}/shared/script.js`,
    sharedCssPath: `${base}/shared/style.css`,
  };
}

async function writeFrontendVariantSlotAssets(
  campaignDir: string,
  campaignId: number,
  folderSlug: string,
  slot: number,
): Promise<{ jsPath: string; cssPath: string }> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    throw new Error(`slot variation invalide: ${slot}`);
  }
  const dirName = `variant-${slot}`;
  const vDir = path.join(campaignDir, dirName);
  await fs.promises.mkdir(vDir, { recursive: true });
  const base = `${ASSET_PUBLIC_ORIGIN}/Campaigns/${folderSlug}`;
  await fs.promises.writeFile(
    path.join(vDir, "script.js"),
    `// Variation ${slot} — squelette\nconsole.info('[abtest] Variation ${slot} chargée (campagne ${campaignId})');\ndocument.documentElement.classList.add('abtest-variation-${slot}');\n`,
    "utf8",
  );
  await fs.promises.writeFile(
    path.join(vDir, "style.css"),
    `/* Variation ${slot} — styles */\nhtml.abtest-variation-${slot} {\n  /* exemple : --abtest-accent: #6366f1; */\n}\n`,
    "utf8",
  );
  return {
    jsPath: `${base}/${dirName}/script.js`,
    cssPath: `${base}/${dirName}/style.css`,
  };
}

function nextFreeExperimentSlot(
  variations: { id: number }[],
): number | null {
  const used = new Set(variations.map((v) => variationSlot(v.id)));
  for (let s = 1; s <= 9; s += 1) {
    if (!used.has(s)) return s;
  }
  return null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const campaignsRoot = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "abtest-campaigns-segments",
);
const consentConfigPath = path.join(campaignsRoot, "consent-config.json");
const storage = createFsStorage({ rootDir: campaignsRoot });

/** Aligné sur `consent-config.json` : domaine racine + cookie (ancien `acceptanceCookie.domain` migré à la lecture). */
type ConsentFile = {
  domain?: string;
  acceptanceCookie?: {
    name?: string;
    value?: string;
    /** @deprecated lu pour migration depuis d’anciens fichiers */
    domain?: string;
  };
};

function consentEnvOverrides(): {
  name: string | undefined;
  value: string | undefined;
  domain: string | undefined;
} {
  const nameRaw = process.env.ABTEST_CONSENT_COOKIE_NAME;
  const valueRaw = process.env.ABTEST_CONSENT_COOKIE_VALUE;
  const domainRaw = process.env.ABTEST_CONSENT_COOKIE_DOMAIN;
  return {
    name:
      nameRaw !== undefined && nameRaw.trim() !== ""
        ? nameRaw.trim()
        : undefined,
    value: valueRaw !== undefined ? valueRaw : undefined,
    domain:
      domainRaw !== undefined && domainRaw.trim() !== ""
        ? domainRaw.trim()
        : undefined,
  };
}

async function readConsentFileFromDisk(): Promise<ConsentFile> {
  try {
    const raw = await fs.promises.readFile(consentConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const ac = parsed.acceptanceCookie;
    let name = "";
    let value = "";
    if (ac && typeof ac === "object" && !Array.isArray(ac)) {
      const o = ac as Record<string, unknown>;
      name = typeof o.name === "string" ? o.name : "";
      value = typeof o.value === "string" ? o.value : "";
    }
    let domain = typeof parsed.domain === "string" ? parsed.domain : "";
    if (!domain.trim() && ac && typeof ac === "object" && !Array.isArray(ac)) {
      const legacy = (ac as Record<string, unknown>).domain;
      if (typeof legacy === "string") {
        domain = legacy;
      }
    }
    return {
      ...(domain.trim() ? { domain: domain.trim() } : {}),
      acceptanceCookie: { name, value },
    };
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function mergeConsentConfig(file: ConsentFile): AnalyticsConsentConfig | null {
  const ac = file.acceptanceCookie ?? { name: "", value: "" };
  const env = consentEnvOverrides();
  const name = (env.name ?? ac.name ?? "").trim();
  const value = env.value !== undefined ? env.value : (ac.value ?? "");
  if (!name) {
    return null;
  }
  return {
    cookieName: name,
    cookieValue: value,
  };
}

function resolveEffectiveDomain(file: ConsentFile): string | null {
  const env = consentEnvOverrides();
  if (env.domain !== undefined) {
    const t = env.domain.trim();
    return t !== "" ? t : null;
  }
  const d = (file.domain ?? "").trim();
  return d !== "" ? d : null;
}

let engine!: ReturnType<typeof createEngine>;

async function rebuildEngineFromDisk(): Promise<void> {
  const file = await readConsentFileFromDisk();
  engine = createEngine({
    storage,
    consentConfig: mergeConsentConfig(file),
  });
}

async function findCampaignConfigPath(campaignId: number): Promise<string | null> {
  const campaignsDir = path.join(campaignsRoot, "Campaigns");
  const entries = await fs.promises.readdir(campaignsDir, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(campaignsDir, entry.name, "config.json");
    try {
      const raw = await fs.promises.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as { id?: number };
      if (parsed.id === campaignId) return candidate;
    } catch {
      // ignore unreadable or invalid JSON
    }
  }
  return null;
}

async function findSegmentConfigPath(segmentId: number): Promise<string | null> {
  const segmentsDir = path.join(campaignsRoot, "Segments");
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(segmentsDir, { withFileTypes: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(segmentsDir, entry.name, "config.json");
    try {
      const raw = await fs.promises.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as { id?: number };
      if (parsed.id === segmentId) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function countCampaignsUsingSegment(
  campaigns: CampaignConfig[],
  segmentId: number,
): number {
  return campaigns.reduce(
    (n, c) => n + (c.segments.includes(segmentId) ? 1 : 0),
    0,
  );
}

function buildSegmentCampaignCountMap(
  campaigns: CampaignConfig[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of campaigns) {
    for (const sid of c.segments) {
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
  }
  return map;
}

const CAMPAIGN_REPO_FILE_MAX_BYTES = 2_000_000;

function resolveSafeCampaignRepoPath(
  campaignDir: string,
  relativePath: string,
): string | null {
  const raw = relativePath.replace(/\\/g, "/").trim();
  if (!raw || raw.includes("\0")) return null;
  const normalized = path.normalize(raw);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }
  const full = path.resolve(campaignDir, normalized);
  const root = path.resolve(campaignDir);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return full;
}

/** Chemin relatif sous le dossier campagne depuis une URL servie sous `/Campaigns/<dossier>/`. */
function relativeRepoPathFromAssetUrl(
  campaignFolderName: string,
  url: string | undefined,
  expectedBasename: "script.js" | "style.css",
): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    const decoded = decodeURI(u.pathname);
    const needle = `/Campaigns/${campaignFolderName}/`;
    let idx = decoded.indexOf(needle);
    if (idx === -1) {
      const encNeedle = `/Campaigns/${encodeURIComponent(campaignFolderName)}/`;
      idx = u.pathname.indexOf(encNeedle);
      if (idx === -1) return null;
      const rel = u.pathname
        .slice(idx + encNeedle.length)
        .replace(/^\/+/, "")
        .split("/")
        .map((seg) => decodeURIComponent(seg))
        .join("/");
      if (!rel) return null;
      return path.posix.basename(rel) === expectedBasename ? rel : null;
    }
    const rel = decoded.slice(idx + needle.length).replace(/^\/+/, "");
    if (!rel) return null;
    return path.posix.basename(rel) === expectedBasename ? rel : null;
  } catch {
    return null;
  }
}

function parseCampaignIdParam(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = parseNumericId(raw);
  if (n === null || !isCampaignId(n)) return null;
  return n;
}

function parseSegmentIdParam(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = parseNumericId(raw);
  if (n === null || !isSegmentId(n)) return null;
  return n;
}

function parseBodyCampaignId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return isCampaignId(value) ? value : null;
  }
  if (typeof value === "string") {
    const n = parseNumericId(value);
    return n !== null && isCampaignId(n) ? n : null;
  }
  return null;
}

function parseBodyVariationId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const n = parseNumericId(value);
    return n;
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/consent-config", async (_req, res, next) => {
  try {
    const file = await readConsentFileFromDisk();
    const ac = file.acceptanceCookie ?? {
      name: "",
      value: "",
    };
    const env = consentEnvOverrides();
    const envOverrides = {
      name: env.name !== undefined,
      value: env.value !== undefined,
      domain: env.domain !== undefined,
    };
    const effectiveConsent = mergeConsentConfig(file);
    const guardActive = effectiveConsent !== null;
    const effectiveDomain = resolveEffectiveDomain(file);
    res.json({
      stored: {
        domain: (file.domain ?? "").trim(),
        acceptanceCookie: {
          name: ac.name ?? "",
          value: ac.value ?? "",
        },
      },
      effective: {
        guardActive,
        domain: effectiveDomain,
        acceptanceCookie: {
          name: effectiveConsent?.cookieName ?? "",
          value: effectiveConsent?.cookieValue ?? "",
        },
      },
      envOverrides,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/consent-config", async (req, res, next) => {
  try {
    const body = req.body as { domain?: unknown; acceptanceCookie?: unknown };
    if (typeof body.domain !== "string" || !body.domain.trim()) {
      res.status(400).json({
        error: "domain (chaîne non vide) requis — domaine du site pour la configuration",
      });
      return;
    }
    if (
      !body.acceptanceCookie ||
      typeof body.acceptanceCookie !== "object" ||
      Array.isArray(body.acceptanceCookie)
    ) {
      res.status(400).json({ error: "acceptanceCookie (objet) requis" });
      return;
    }
    const bc = body.acceptanceCookie as Record<string, unknown>;
    const name = typeof bc.name === "string" ? bc.name : "";
    const value = typeof bc.value === "string" ? bc.value : "";
    const toWrite: ConsentFile = {
      domain: body.domain.trim(),
      acceptanceCookie: {
        name,
        value,
      },
    };
    await fs.promises.writeFile(
      consentConfigPath,
      `${JSON.stringify(toWrite, null, 2)}\n`,
      "utf8",
    );
    await rebuildEngineFromDisk();
    const fileAfter = await readConsentFileFromDisk();
    const effectiveConsent = mergeConsentConfig(fileAfter);
    const envSnapshot = consentEnvOverrides();
    const storedAc = fileAfter.acceptanceCookie ?? {
      name: "",
      value: "",
    };
    res.json({
      stored: {
        domain: (fileAfter.domain ?? "").trim(),
        acceptanceCookie: {
          name: storedAc.name ?? "",
          value: storedAc.value ?? "",
        },
      },
      effective: {
        guardActive: effectiveConsent !== null,
        domain: resolveEffectiveDomain(fileAfter),
        acceptanceCookie: {
          name: effectiveConsent?.cookieName ?? "",
          value: effectiveConsent?.cookieValue ?? "",
        },
      },
      envOverrides: {
        name: envSnapshot.name !== undefined,
        value: envSnapshot.value !== undefined,
        domain: envSnapshot.domain !== undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns", async (_req, res, next) => {
  try {
    const campaigns = await engine.listCampaigns();
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
});

app.post("/api/campaigns", async (req, res, next) => {
  try {
    const { id, name, type, tags, privacyMode: privacyRaw } = req.body as Record<
      string,
      unknown
    >;
    const cid = parseBodyCampaignId(id);
    const nameTrim = typeof name === "string" ? name.trim() : "";
    if (cid === null || !nameTrim || typeof type !== "string") {
      res.status(400).json({
        error:
          "id (nombre 10000–99999), name (non vide) et type sont requis",
      });
      return;
    }
    if (type !== "frontend" && type !== "backend") {
      res.status(400).json({ error: "type invalide" });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "privacyMode")) {
      if (privacyRaw !== "measurement" && privacyRaw !== "technical") {
        res.status(400).json({
          error: "privacyMode doit être measurement ou technical",
        });
        return;
      }
    }
    const campaignsDir = path.join(campaignsRoot, "Campaigns");
    await fs.promises.mkdir(campaignsDir, { recursive: true });
    const folderName = campaignFolderSlugFromName(nameTrim);
    const campaignFolder = path.join(campaignsDir, folderName);
    const configPath = path.join(campaignFolder, "config.json");
    try {
      await fs.promises.access(configPath, fs.constants.F_OK);
      res.status(409).json({ error: "Campaign already exists" });
      return;
    } catch {
      // ok, n'existe pas
    }
    const nowIso = new Date().toISOString();
    const initial: Record<string, unknown> = {
      id: cid,
      name: nameTrim,
      type,
      status: "draft",
      createdAt: nowIso,
      lastStatusChangeAt: nowIso,
      segments: [] as number[],
      variations: [
        {
          id: variationIdForSlot(cid, 0),
          name: "Original",
          trafficAllocation: 50,
        },
        {
          id: variationIdForSlot(cid, 1),
          name: "Variation 1",
          trafficAllocation: 50,
        },
      ],
    };
    if (Object.prototype.hasOwnProperty.call(req.body, "privacyMode")) {
      if (privacyRaw === "technical") {
        initial.privacyMode = "technical";
      }
      if (privacyRaw === "measurement") {
        initial.privacyMode = "measurement";
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
      const norm = normalizeCampaignTagsInput(tags);
      if (norm === null) {
        res.status(400).json({
          error:
            "tags doit être un tableau de chaînes (max 32 tags, 64 caractères chacun)",
        });
        return;
      }
      if (norm.length > 0) {
        initial.tags = norm;
      }
    }
    await fs.promises.mkdir(campaignFolder, { recursive: true });
    if (type === "frontend") {
      const shared = await writeFrontendSharedAssets(
        campaignFolder,
        cid,
        folderName,
      );
      initial.sharedJsPath = shared.sharedJsPath;
      initial.sharedCssPath = shared.sharedCssPath;
      const v1 = await writeFrontendVariantSlotAssets(
        campaignFolder,
        cid,
        folderName,
        1,
      );
      const vars = initial.variations as Record<string, unknown>[];
      vars[1] = {
        ...vars[1],
        jsPath: v1.jsPath,
        cssPath: v1.cssPath,
      };
    }
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(initial, null, 2)}\n`,
      "utf8",
    );
    const created = await engine.getCampaignById(cid);
    res.status(201).json(created ?? initial);
  } catch (error) {
    next(error);
  }
});

/**
 * Proxy lecture des fichiers JS/CSS référencés par la campagne (évite CORS navigateur).
 * `asset` : shared-js | shared-css | js | css (js/css exigent variationId).
 */
app.get("/api/campaigns/:id/variation-source", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const campaign = await engine.getCampaignById(campaignId);
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const asset = String(req.query.asset ?? "");
    let url: string | undefined;
    switch (asset) {
      case "shared-js":
        url = campaign.sharedJsPath;
        break;
      case "shared-css":
        url = campaign.sharedCssPath;
        break;
      case "js":
      case "css": {
        const vidRaw = req.query.variationId;
        const vid =
          typeof vidRaw === "string"
            ? parseNumericId(vidRaw)
            : typeof vidRaw === "number" && Number.isInteger(vidRaw)
              ? vidRaw
              : null;
        if (vid === null) {
          res.status(400).json({ error: "variationId requis pour js ou css" });
          return;
        }
        const v = campaign.variations.find((x) => x.id === vid);
        if (!v) {
          res.status(404).json({ error: "Variation introuvable" });
          return;
        }
        url = asset === "js" ? v.jsPath : v.cssPath;
        break;
      }
      default:
        res.status(400).json({
          error: "asset doit être shared-js, shared-css, js ou css",
        });
        return;
    }
    if (!url || typeof url !== "string" || url.trim() === "") {
      res.status(404).json({
        error: "Aucune ressource configurée pour cette entrée",
      });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const r = await fetch(url.trim(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) {
      res.status(502).json({
        error: `Impossible de récupérer la ressource distante (HTTP ${r.status})`,
      });
      return;
    }
    const text = await r.text();
    res.type("text/plain; charset=utf-8").send(text);
  } catch (error) {
    next(error);
  }
});

/**
 * `script.js` / `style.css` du dossier campagne pour l’onglet Développement (pas d’arborescence complète).
 * Query : `scope=shared|variation`, `kind=script|style`, et `variationId` si `scope=variation`.
 */
app.get("/api/campaigns/:id/dev-asset", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const scope = String(req.query.scope ?? "");
    const kind = String(req.query.kind ?? "");
    if (kind !== "script" && kind !== "style") {
      res.status(400).json({ error: "kind doit être script ou style" });
      return;
    }
    if (scope !== "shared" && scope !== "variation") {
      res.status(400).json({ error: "scope doit être shared ou variation" });
      return;
    }

    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const campaignDir = path.dirname(configPath);
    const folderName = path.basename(campaignDir);

    let rel: string | null = null;
    if (scope === "shared") {
      rel = kind === "script" ? "shared/script.js" : "shared/style.css";
    } else {
      const vidRaw = req.query.variationId;
      const vid =
        typeof vidRaw === "string"
          ? parseNumericId(vidRaw)
          : typeof vidRaw === "number" && Number.isInteger(vidRaw)
            ? vidRaw
            : null;
      if (vid === null) {
        res
          .status(400)
          .json({ error: "variationId requis pour scope=variation" });
        return;
      }
      const campaign = await engine.getCampaignById(campaignId);
      if (!campaign) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      const v = campaign.variations.find((x) => x.id === vid);
      if (!v) {
        res.status(404).json({ error: "Variation introuvable" });
        return;
      }
      const slot = variationSlot(v.id);
      const expectedBasename =
        kind === "script" ? ("script.js" as const) : ("style.css" as const);
      rel =
        kind === "script"
          ? relativeRepoPathFromAssetUrl(folderName, v.jsPath, "script.js")
          : relativeRepoPathFromAssetUrl(folderName, v.cssPath, "style.css");
      if (!rel && slot > 0) {
        rel = `variant-${slot}/${expectedBasename}`;
      }
    }

    if (!rel) {
      res.status(404).json({
        error:
          "Aucun fichier correspondant (chemins absents dans la config et aucun dossier variant-n)",
      });
      return;
    }

    const base = path.posix.basename(rel.replace(/\\/g, "/"));
    if (kind === "script" && base !== "script.js") {
      res.status(400).json({ error: "Le script doit être nommé script.js" });
      return;
    }
    if (kind === "style" && base !== "style.css") {
      res
        .status(400)
        .json({ error: "La feuille de style doit être nommée style.css" });
      return;
    }

    const safe = resolveSafeCampaignRepoPath(campaignDir, rel);
    if (!safe) {
      res.status(400).json({ error: "chemin invalide" });
      return;
    }
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(safe);
    } catch {
      res.status(404).json({ error: "Fichier introuvable" });
      return;
    }
    if (!st.isFile()) {
      res.status(400).json({ error: "chemin invalide" });
      return;
    }
    if (st.size > CAMPAIGN_REPO_FILE_MAX_BYTES) {
      res.status(413).json({
        error: `Fichier trop volumineux (max ${CAMPAIGN_REPO_FILE_MAX_BYTES} octets)`,
      });
      return;
    }
    let text: string;
    try {
      text = await fs.promises.readFile(safe, "utf8");
    } catch {
      res.status(415).json({
        error: "Lecture impossible (fichier binaire ou encodage non UTF-8)",
      });
      return;
    }
    res.json({
      folderName,
      path: rel.replace(/\\/g, "/"),
      content: text,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns/:id", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const campaign = await engine.getCampaignById(campaignId);
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.put("/api/campaigns/:id", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const { status, variations, simulationBaseUrl, tags, description, segments } =
      req.body as {
        status?: string;
        variations?: { id: number; trafficAllocation: number }[];
        simulationBaseUrl?: string | null;
        tags?: unknown;
        description?: unknown;
        segments?: unknown;
      };
    const allCampaigns = await engine.listCampaigns();
    const target = allCampaigns.find((c) => c.id === campaignId);
    if (!target) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(500).json({ error: "Config file not found for campaign" });
      return;
    }
    const rawConfig = await fs.promises.readFile(configPath, "utf8");
    const config = JSON.parse(rawConfig) as Record<string, unknown> & {
      status?: string;
      variations: { id: number; trafficAllocation: number; name: string }[];
    };
    if (status !== undefined && status !== null) {
      if (
        typeof status !== "string" ||
        !["draft", "running", "paused", "stopped"].includes(status)
      ) {
        res.status(400).json({ error: "status invalide" });
        return;
      }
      const prevStatus = String(config.status ?? target.status);
      if (status === "draft" && prevStatus !== "draft") {
        res.status(400).json({
          error:
            "Impossible de repasser en brouillon une fois la campagne sortie du statut brouillon.",
        });
        return;
      }
      if (status !== prevStatus) {
        const nowIso = new Date().toISOString();
        config.lastStatusChangeAt = nowIso;
        if (status === "running" && !config.firstPublishedAt) {
          config.firstPublishedAt = nowIso;
        }
      }
      config.status = status;
    }
    if (variations && Array.isArray(variations)) {
      const map = new Map(
        variations.map((v) => [v.id, v.trafficAllocation] as const),
      );
      config.variations = config.variations.map((v) =>
        map.has(v.id)
          ? { ...v, trafficAllocation: map.get(v.id) ?? v.trafficAllocation }
          : v,
      );
    }
    if (simulationBaseUrl !== undefined) {
      if (
        simulationBaseUrl === null ||
        (typeof simulationBaseUrl === "string" && simulationBaseUrl.trim() === "")
      ) {
        delete config.simulationBaseUrl;
      } else if (typeof simulationBaseUrl === "string") {
        config.simulationBaseUrl = simulationBaseUrl.trim();
      } else {
        res.status(400).json({ error: "simulationBaseUrl invalide" });
        return;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
      const norm = normalizeCampaignTagsInput(tags);
      if (norm === null) {
        res.status(400).json({ error: "tags invalide" });
        return;
      }
      if (norm.length === 0) {
        delete config.tags;
      } else {
        config.tags = norm;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
      if (description === null) {
        delete config.description;
      } else if (typeof description === "string") {
        const t = description.trim();
        if (t === "") {
          delete config.description;
        } else if (t.length > 4000) {
          res.status(400).json({ error: "description trop longue (4000 max)" });
          return;
        } else {
          config.description = t;
        }
      } else {
        res.status(400).json({ error: "description invalide" });
        return;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "segments")) {
      if (!Array.isArray(segments)) {
        res.status(400).json({ error: "segments doit être un tableau" });
        return;
      }
      const nextSeg: number[] = [];
      const seenSeg = new Set<number>();
      for (const item of segments) {
        const n =
          typeof item === "number" && Number.isInteger(item)
            ? item
            : typeof item === "string"
              ? parseNumericId(item)
              : null;
        if (n === null || !isSegmentId(n)) {
          res.status(400).json({
            error: `segment id invalide (attendu ${SEGMENT_ID_MIN}–${SEGMENT_ID_MAX})`,
          });
          return;
        }
        if (seenSeg.has(n)) continue;
        seenSeg.add(n);
        nextSeg.push(n);
      }
      nextSeg.sort((a, b) => a - b);
      config.segments = nextSeg;
    }
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const updated = await engine.getCampaignById(campaignId);
    res.json(updated ?? config);
  } catch (error) {
    next(error);
  }
});

/** Renommer une variation (autorisé même après mise en ligne ; pas le slot 0 / Original). */
app.patch("/api/campaigns/:id/variations/:variationId", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    const vid = parseNumericId(String(req.params.variationId ?? ""));
    if (
      campaignId === null ||
      vid === null ||
      !isVariationIdForCampaign(vid, campaignId)
    ) {
      res.status(400).json({ error: "Identifiants invalides" });
      return;
    }
    if (variationSlot(vid) === 0) {
      res.status(400).json({
        error:
          "Le libellé de la variation contrôle (Original) ne peut pas être modifié.",
      });
      return;
    }
    const { name } = req.body as { name?: unknown };
    if (typeof name !== "string") {
      res.status(400).json({ error: "name (chaîne) requis" });
      return;
    }
    const nameT = name.trim();
    if (!nameT || nameT.length > 200) {
      res.status(400).json({ error: "name invalide (1–200 caractères)" });
      return;
    }
    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const rawConfig = await fs.promises.readFile(configPath, "utf8");
    const config = JSON.parse(rawConfig) as {
      variations: { id: number; name: string; trafficAllocation: number }[];
    };
    const idx = config.variations.findIndex((v) => v.id === vid);
    if (idx === -1) {
      res.status(404).json({ error: "Variation introuvable" });
      return;
    }
    config.variations[idx] = { ...config.variations[idx]!, name: nameT };
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const updated = await engine.getCampaignById(campaignId);
    res.json(updated ?? config);
  } catch (error) {
    next(error);
  }
});

/** Ajouter une variation (brouillon uniquement, avant toute mise en ligne). */
app.post("/api/campaigns/:id/variations", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const live = await engine.getCampaignById(campaignId);
    if (!live) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (!canMutateVariationStructure(live)) {
      res.status(403).json({
        error:
          "Création de variation impossible après mise en ligne ou hors brouillon.",
      });
      return;
    }
    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(500).json({ error: "Config file not found for campaign" });
      return;
    }
    const rawConfig = await fs.promises.readFile(configPath, "utf8");
    const config = JSON.parse(rawConfig) as Record<string, unknown> & {
      variations: Record<string, unknown>[];
    };
    const slot = nextFreeExperimentSlot(
      config.variations as { id: number }[],
    );
    if (slot === null) {
      res.status(400).json({
        error: "Nombre maximum de variations (10) atteint.",
      });
      return;
    }
    const { name: nameOpt } = req.body as { name?: unknown };
    let vname = `Variation ${slot}`;
    if (typeof nameOpt === "string") {
      const t = nameOpt.trim();
      if (t) vname = t.slice(0, 200);
    }
    const newId = variationIdForSlot(campaignId, slot);
    const entry: Record<string, unknown> = {
      id: newId,
      name: vname,
      trafficAllocation: 0,
    };
    if (live.type === "frontend") {
      const folderSlug = path.basename(path.dirname(configPath));
      const paths = await writeFrontendVariantSlotAssets(
        path.dirname(configPath),
        campaignId,
        folderSlug,
        slot,
      );
      entry.jsPath = paths.jsPath;
      entry.cssPath = paths.cssPath;
    }
    config.variations.push(entry);
    config.variations.sort(
      (a, b) => (a.id as number) - (b.id as number),
    );
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const updated = await engine.getCampaignById(campaignId);
    res.status(201).json(updated ?? config);
  } catch (error) {
    next(error);
  }
});

/** Supprimer une variation (brouillon uniquement, avant mise en ligne ; garde au moins une variation d’expérimentation, Original exclu du décompte). */
app.delete("/api/campaigns/:id/variations/:variationId", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    const vid = parseNumericId(String(req.params.variationId ?? ""));
    if (
      campaignId === null ||
      vid === null ||
      !isVariationIdForCampaign(vid, campaignId)
    ) {
      res.status(400).json({ error: "Identifiants invalides" });
      return;
    }
    const live = await engine.getCampaignById(campaignId);
    if (!live) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (!canMutateVariationStructure(live)) {
      res.status(403).json({
        error:
          "Suppression de variation impossible après mise en ligne ou hors brouillon.",
      });
      return;
    }
    if (live.variations.length <= 1) {
      res.status(400).json({
        error: "Au moins une variation doit rester.",
      });
      return;
    }
    if (variationSlot(vid) === 0) {
      res.status(400).json({
        error:
          "La variation contrôle (Original) ne peut pas être supprimée.",
      });
      return;
    }
    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(500).json({ error: "Config file not found for campaign" });
      return;
    }
    const rawConfig = await fs.promises.readFile(configPath, "utf8");
    const config = JSON.parse(rawConfig) as {
      variations: Record<string, unknown>[];
    };
    const before = config.variations.length;
    config.variations = config.variations.filter(
      (v) => (v.id as number) !== vid,
    );
    if (config.variations.length === before) {
      res.status(404).json({ error: "Variation introuvable" });
      return;
    }
    const campaignDir = path.dirname(configPath);
    const slot = variationSlot(vid);
    const variantDir = path.join(campaignDir, `variant-${slot}`);
    try {
      await fs.promises.rm(variantDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const updated = await engine.getCampaignById(campaignId);
    res.json(updated ?? config);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/campaigns/:id", async (req, res, next) => {
  try {
    const campaignId = parseCampaignIdParam(req.params.id);
    if (campaignId === null) {
      res.status(400).json({ error: "Invalid campaign id" });
      return;
    }
    const campaign = await engine.getCampaignById(campaignId);
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (campaign.status !== "draft" && campaign.status !== "stopped") {
      res.status(403).json({
        error:
          "Suppression autorisée uniquement pour les campagnes en brouillon ou arrêtées",
      });
      return;
    }
    const configPath = await findCampaignConfigPath(campaignId);
    if (!configPath) {
      res.status(500).json({ error: "Config file not found for campaign" });
      return;
    }
    const campaignDir = path.dirname(configPath);
    await fs.promises.rm(campaignDir, { recursive: true, force: true });
    await rebuildEngineFromDisk();
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.get("/api/segments", async (_req, res, next) => {
  try {
    const [segments, campaigns] = await Promise.all([
      engine.listSegments(),
      engine.listCampaigns(),
    ]);
    const countMap = buildSegmentCampaignCountMap(campaigns);
    const payload = segments.map((s) => ({
      ...s,
      campaignCount: countMap.get(s.id) ?? 0,
    }));
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/segments", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const parsed = parseSegmentFileForWrite(body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Segment invalide",
        details: parsed.error.format(),
      });
      return;
    }
    const data = parsed.data;
    const nameTrim = typeof data.name === "string" ? data.name.trim() : "";
    if (!nameTrim) {
      res.status(400).json({ error: "Le nom du segment ne peut pas être vide" });
      return;
    }
    if (nameTrim !== data.name) {
      res.status(400).json({
        error: "Le nom ne doit pas commencer ou finir par des espaces",
      });
      return;
    }

    const existing = await engine.getSegmentById(data.id);
    if (existing) {
      res.status(409).json({ error: "Un segment avec cet identifiant existe déjà" });
      return;
    }

    const segmentsDir = path.join(campaignsRoot, "Segments");
    await fs.promises.mkdir(segmentsDir, { recursive: true });
    const folderName = campaignFolderSlugFromName(nameTrim);
    const segmentFolder = path.join(segmentsDir, folderName);
    const configPath = path.join(segmentFolder, "config.json");
    try {
      await fs.promises.access(configPath, fs.constants.F_OK);
      res.status(409).json({
        error:
          "Un dossier segment existe déjà pour ce nom (slug). Choisissez un autre nom.",
      });
      return;
    } catch {
      // absent : ok
    }

    const toWrite = segmentValidatedToDiskJson({
      ...data,
      name: nameTrim,
    });
    await fs.promises.mkdir(segmentFolder, { recursive: true });
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(toWrite, null, 2)}\n`,
      "utf8",
    );
    await rebuildEngineFromDisk();
    const created = await engine.getSegmentById(data.id);
    const campaigns = await engine.listCampaigns();
    const campaignCount = countCampaignsUsingSegment(campaigns, data.id);
    res.status(201).json(
      created ? { ...created, campaignCount } : { ...toWrite, campaignCount },
    );
  } catch (error) {
    next(error);
  }
});

app.put("/api/segments/:id", async (req, res, next) => {
  try {
    const segmentId = parseSegmentIdParam(req.params.id);
    if (segmentId === null) {
      res.status(400).json({ error: "Invalid segment id" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const parsed = parseSegmentFileForWrite(body);
    if (!parsed.ok) {
      res.status(400).json({
        error: "Segment invalide",
        details: parsed.error.format(),
      });
      return;
    }
    const data = parsed.data;
    if (data.id !== segmentId) {
      res.status(400).json({
        error: "L’identifiant du corps ne correspond pas à l’URL",
      });
      return;
    }
    const nameTrim = typeof data.name === "string" ? data.name.trim() : "";
    if (!nameTrim) {
      res.status(400).json({ error: "Le nom du segment ne peut pas être vide" });
      return;
    }
    if (nameTrim !== data.name) {
      res.status(400).json({
        error: "Le nom ne doit pas commencer ou finir par des espaces",
      });
      return;
    }

    const configPath = await findSegmentConfigPath(segmentId);
    if (!configPath) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }

    const toWrite = segmentValidatedToDiskJson({
      ...data,
      name: nameTrim,
    });
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(toWrite, null, 2)}\n`,
      "utf8",
    );
    await rebuildEngineFromDisk();
    const updated = await engine.getSegmentById(segmentId);
    const campaigns = await engine.listCampaigns();
    const campaignCount = countCampaignsUsingSegment(campaigns, segmentId);
    if (!updated) {
      res.status(500).json({ error: "Segment introuvable après écriture" });
      return;
    }
    res.json({ ...updated, campaignCount });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/segments/:id", async (req, res, next) => {
  try {
    const segmentId = parseSegmentIdParam(req.params.id);
    if (segmentId === null) {
      res.status(400).json({ error: "Invalid segment id" });
      return;
    }
    const campaigns = await engine.listCampaigns();
    const n = countCampaignsUsingSegment(campaigns, segmentId);
    if (n > 0) {
      res.status(409).json({
        error: `Impossible de supprimer : le segment est encore utilisé par ${n} campagne(s).`,
      });
      return;
    }
    const configPath = await findSegmentConfigPath(segmentId);
    if (!configPath) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }
    const segmentDir = path.dirname(configPath);
    await fs.promises.rm(segmentDir, { recursive: true, force: true });
    await rebuildEngineFromDisk();
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.get("/api/segments/:id", async (req, res, next) => {
  try {
    const segmentId = parseSegmentIdParam(req.params.id);
    if (segmentId === null) {
      res.status(400).json({ error: "Invalid segment id" });
      return;
    }
    const segment = await engine.getSegmentById(segmentId);
    if (!segment) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }
    const campaigns = await engine.listCampaigns();
    const campaignCount = countCampaignsUsingSegment(campaigns, segmentId);
    res.json({ ...segment, campaignCount });
  } catch (error) {
    next(error);
  }
});

app.post("/api/evaluate", async (req, res, next) => {
  try {
    const { campaignId: rawCampaignId, context, simulation } = req.body as {
      campaignId?: unknown;
      context?: Record<string, unknown>;
      simulation?: { variationId?: unknown } | null;
    };
    const campaignId = parseBodyCampaignId(rawCampaignId);
    if (campaignId === null) {
      res.status(400).json({ error: "campaignId is required (10000–99999)" });
      return;
    }

    let simulationNorm: { variationId?: number } | null = null;
    if (simulation != null && typeof simulation === "object") {
      simulationNorm = {};
      if (simulation.variationId !== undefined) {
        const n = parseBodyVariationId(simulation.variationId);
        if (n !== null) simulationNorm.variationId = n;
      }
    }

    const result = await engine.pickVariationForCampaign({
      campaignId,
      context: context ?? {},
      simulation: simulationNorm,
    });
    if (!result) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const allSegments = await engine.listSegments();
    const matchedSegments = await engine.evaluateSegmentsForContext(
      context ?? {},
    );
    const matchedIds = new Set(matchedSegments.map((s) => s.id));
    const campaignSegments = allSegments.filter((s) =>
      result.campaign.segments.includes(s.id),
    );
    const ctx = (context ?? {}) as UserContext;
    const stickyRequested = parseAssignedVariationIdFromContext(ctx);
    res.json({
      ...result,
      matchedSegmentIds: Array.from(matchedIds),
      campaignSegments: campaignSegments.map((s) => ({
        id: s.id,
        name: s.name,
      })),
      diagnostics: {
        hadAssignedVariationInRequest: stickyRequested !== undefined,
        resolvedBySticky: result.reason === "by_sticky_assignment",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/evaluate/segment-diagnostics", async (req, res, next) => {
  try {
    const { campaignId: rawCampaignId, context, simulation } = req.body as {
      campaignId?: unknown;
      context?: Record<string, unknown>;
      simulation?: unknown;
    };
    const campaignId = parseBodyCampaignId(rawCampaignId);
    if (campaignId === null) {
      res.status(400).json({ error: "campaignId is required (10000–99999)" });
      return;
    }
    if (
      simulation === null ||
      simulation === undefined ||
      typeof simulation !== "object" ||
      Array.isArray(simulation)
    ) {
      res.status(400).json({
        error: "simulation is required (object, e.g. {} for lab diagnostic)",
      });
      return;
    }

    const campaign = await engine.getCampaignById(campaignId);
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const ctx = (context ?? {}) as UserContext;
    const allSegments = await engine.listSegments();
    const campaignSegments = allSegments.filter((segment) =>
      campaign.segments.includes(segment.id),
    );

    const segments = campaignSegments.map((segment) => ({
      id: segment.id,
      name: segment.name,
      matches: evaluateSegmentMatch(segment, ctx),
      breakdown: evaluateSegmentConditionBreakdown(segment.condition, ctx),
    }));

    res.json({ campaignId, segments });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

const port = Number(process.env.PORT ?? 5002);

async function main(): Promise<void> {
  await rebuildEngineFromDisk();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[abtest-solution/api] listening on http://localhost:${port}`);
  });
}

void main();
