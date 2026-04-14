import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createEngine,
  parseNumericId,
  isCampaignId,
  isSegmentId,
  variationIdForSlot,
  evaluateSegmentMatch,
  evaluateSegmentConditionBreakdown,
  parseAssignedVariationIdFromContext,
  type UserContext,
} from "@abtest-solution/core";
import { createFsStorage } from "@abtest-solution/storage-fs";

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const campaignsRoot = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "abtest-campaigns-segments",
);
const storage = createFsStorage({ rootDir: campaignsRoot });
const engine = createEngine({ storage });

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
    const { id, name, type, status } = req.body as Record<string, unknown>;
    const cid = parseBodyCampaignId(id);
    if (cid === null || !name || typeof name !== "string" || !type) {
      res.status(400).json({
        error:
          "id (nombre 10000–99999), name et type sont requis",
      });
      return;
    }
    if (type !== "frontend" && type !== "backend") {
      res.status(400).json({ error: "type invalide" });
      return;
    }
    const campaignsDir = path.join(campaignsRoot, "Campaigns");
    await fs.promises.mkdir(campaignsDir, { recursive: true });
    const folderName = name.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const campaignFolder = path.join(campaignsDir, folderName);
    const configPath = path.join(campaignFolder, "config.json");
    try {
      await fs.promises.access(configPath, fs.constants.F_OK);
      res.status(409).json({ error: "Campaign already exists" });
      return;
    } catch {
      // ok, n'existe pas
    }
    const initial = {
      id: cid,
      name,
      type,
      status: (status as string) ?? "draft",
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
    await fs.promises.mkdir(campaignFolder, { recursive: true });
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(initial, null, 2)}\n`,
      "utf8",
    );
    res.status(201).json(initial);
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
    const { status, variations } = req.body as {
      status?: string;
      variations?: { id: number; trafficAllocation: number }[];
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
    const config = JSON.parse(rawConfig) as {
      status?: string;
      variations: { id: number; trafficAllocation: number; name: string }[];
    };
    if (status) {
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
    await fs.promises.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    res.json(config);
  } catch (error) {
    next(error);
  }
});

app.get("/api/segments", async (_req, res, next) => {
  try {
    const segments = await engine.listSegments();
    res.json(segments);
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
    res.json(segment);
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
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[abtest-solution/api] listening on http://localhost:${port}`);
});
