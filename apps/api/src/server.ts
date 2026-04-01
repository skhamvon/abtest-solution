import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createEngine } from "../../../packages/core/src/index.ts";
import type {
  CampaignConfig,
  SegmentConfig,
  UserContext,
} from "../../../packages/core/src/index.ts";
import { createFsStorage } from "../../../packages/storage-fs/src/index.ts";

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

app.get("/api/campaigns/:id", async (req, res, next) => {
  try {
    const campaign = await engine.getCampaignById(req.params.id);
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
    const campaignId = req.params.id;
    const { status, variations } = req.body as {
      status?: CampaignConfig["status"];
      variations?: { id: string; trafficAllocation: number }[];
    };

    // Retrouver le dossier de la campagne en inspectant les configs existantes
    const allCampaigns = await engine.listCampaigns();
    const target = allCampaigns.find((c) => c.id === campaignId);
    if (!target) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const campaignsDir = path.join(campaignsRoot, "Campaigns");
    const entries = await fs.promises.readdir(campaignsDir, {
      withFileTypes: true,
    });
    let configPath: string | null = null;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(campaignsDir, entry.name, "config.json");
      try {
        const raw = await fs.promises.readFile(candidate, "utf8");
        const parsed = JSON.parse(raw) as CampaignConfig;
        if (parsed.id === campaignId) {
          configPath = candidate;
          break;
        }
      } catch {
        // ignore parse errors here; they seront déjà loggés côté storage
      }
    }

    if (!configPath) {
      res.status(500).json({ error: "Config file not found for campaign" });
      return;
    }

    const rawConfig = await fs.promises.readFile(configPath, "utf8");
    const config = JSON.parse(rawConfig) as CampaignConfig;

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
    const segment = await engine.getSegmentById(req.params.id);
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
    const { campaignId, context, simulation } = req.body as {
      campaignId: string;
      context: UserContext;
      simulation?: { variationId?: string } | null;
    };
    if (!campaignId) {
      res.status(400).json({ error: "campaignId is required" });
      return;
    }
    const result = await engine.pickVariationForCampaign({
      campaignId,
      context: context ?? {},
      simulation: simulation ?? null,
    });
    if (!result) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    // Enrichir la réponse avec des infos de ciblage pour la modale de simulation
    const allSegments: SegmentConfig[] = await engine.listSegments();
    const matchedSegments = await engine.evaluateSegmentsForContext(
      context ?? {},
    );
    const matchedIds = new Set(matchedSegments.map((s) => s.id));
    const campaignSegments = allSegments.filter((s) =>
      result.campaign.segments.includes(s.id),
    );

    res.json({
      ...result,
      matchedSegmentIds: Array.from(matchedIds),
      campaignSegments: campaignSegments.map((s) => ({
        id: s.id,
        name: s.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Basic error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 5002);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[abtest-solution/api] listening on http://localhost:${port}`);
});

