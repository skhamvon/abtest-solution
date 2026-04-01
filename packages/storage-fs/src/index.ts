import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type {
  CampaignConfig,
  SegmentConfig,
  StoragePort,
} from "@abtest-solution/core";

const variationConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  trafficAllocation: z.number().min(0).max(100),
  jsPath: z.string().optional(),
  cssPath: z.string().optional(),
  featureFlags: z.record(z.boolean()).optional(),
  pianoEventKey: z.string().optional(),
});

const campaignConfigSchema: z.ZodType<CampaignConfig> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.union([z.literal("frontend"), z.literal("backend")]),
  status: z.union([
    z.literal("draft"),
    z.literal("running"),
    z.literal("paused"),
    z.literal("stopped"),
  ]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  segments: z.array(z.string()),
  variations: z.array(variationConfigSchema),
  simulationBaseUrl: z.string().optional(),
});

const segmentConfigSchema: z.ZodType<SegmentConfig> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  criteria: z.record(z.any()),
});

export interface FsStorageOptions {
  rootDir: string;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error(`Error reading JSON file at ${filePath}`, error);
    throw error;
  }
}

async function readCampaignConfigs(rootDir: string): Promise<CampaignConfig[]> {
  const campaignsRoot = path.join(rootDir, "Campaigns");
  let campaignDirs: string[] = [];
  try {
    const entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
    campaignDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const campaigns: CampaignConfig[] = [];

  for (const dir of campaignDirs) {
    const configPath = path.join(campaignsRoot, dir, "config.json");
    const rawConfig = await readJsonFile<unknown>(configPath);
    if (!rawConfig) continue;

    const parseResult = campaignConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      console.warn(
        `Invalid campaign config in ${configPath}:`,
        parseResult.error.format(),
      );
      continue;
    }
    campaigns.push(parseResult.data);
  }

  return campaigns;
}

async function readSegmentConfigs(rootDir: string): Promise<SegmentConfig[]> {
  const segmentsRoot = path.join(rootDir, "Segments");
  let segmentDirs: string[] = [];
  try {
    const entries = await fs.readdir(segmentsRoot, { withFileTypes: true });
    segmentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const segments: SegmentConfig[] = [];

  for (const dir of segmentDirs) {
    const configPath = path.join(segmentsRoot, dir, "config.json");
    const rawConfig = await readJsonFile<unknown>(configPath);
    if (!rawConfig) continue;

    const parseResult = segmentConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      console.warn(
        `Invalid segment config in ${configPath}:`,
        parseResult.error.format(),
      );
      continue;
    }
    segments.push(parseResult.data);
  }

  return segments;
}

export function createFsStorage(options: FsStorageOptions): StoragePort {
  const { rootDir } = options;

  return {
    async listCampaigns() {
      return readCampaignConfigs(rootDir);
    },
    async getCampaignById(id: string) {
      const all = await readCampaignConfigs(rootDir);
      return all.find((c) => c.id === id) ?? null;
    },
    async listSegments() {
      return readSegmentConfigs(rootDir);
    },
    async getSegmentById(id: string) {
      const all = await readSegmentConfigs(rootDir);
      return all.find((s) => s.id === id) ?? null;
    },
  };
}

