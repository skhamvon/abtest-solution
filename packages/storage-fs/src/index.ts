import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import {
  normalizeRawSegment,
  CAMPAIGN_ID_MAX,
  CAMPAIGN_ID_MIN,
  SEGMENT_ID_MAX,
  SEGMENT_ID_MIN,
} from "@abtest-solution/core";
import type { SegmentCondition } from "@abtest-solution/core";

const segmentIdSchema = z
  .number()
  .int()
  .min(SEGMENT_ID_MIN)
  .max(SEGMENT_ID_MAX);

const campaignIdSchema = z
  .number()
  .int()
  .min(CAMPAIGN_ID_MIN)
  .max(CAMPAIGN_ID_MAX);

const variationConfigSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  trafficAllocation: z.number().min(0).max(100),
  jsPath: z.string().optional(),
  cssPath: z.string().optional(),
  featureFlags: z.record(z.boolean()).optional(),
  pianoEventKey: z.string().optional(),
});

const campaignConfigSchema = z
  .object({
    id: campaignIdSchema,
    name: z.string(),
    type: z.union([z.literal("frontend"), z.literal("backend")]),
    privacyMode: z
      .union([z.literal("measurement"), z.literal("technical")])
      .optional(),
    status: z.union([
      z.literal("draft"),
      z.literal("running"),
      z.literal("paused"),
      z.literal("stopped"),
    ]),
    createdAt: z.string().optional(),
    firstPublishedAt: z.string().optional(),
    lastStatusChangeAt: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    segments: z.array(segmentIdSchema),
    variations: z.array(variationConfigSchema).min(1),
    simulationBaseUrl: z.string().optional(),
    sharedJsPath: z.string().optional(),
    sharedCssPath: z.string().optional(),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    description: z.string().max(4000).optional(),
  })
  .superRefine((data, ctx) => {
    const base = data.id * 10;
    const maxV = base + 9;
    const seen = new Set<number>();
    for (let i = 0; i < data.variations.length; i += 1) {
      const v = data.variations[i]!;
      if (v.id < base || v.id > maxV) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Variation id ${v.id} must be between ${base} and ${maxV} (campaign ${data.id} × 10 + slot 0–9)`,
          path: ["variations", i, "id"],
        });
      }
      if (seen.has(v.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variation id ${v.id}`,
          path: ["variations", i, "id"],
        });
      }
      seen.add(v.id);
    }
  });

const deviceKindSchema = z.enum(["desktop", "mobile", "tablet"]);

const urlRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("url"),
    operator: z.literal("equals"),
    value: z.string().min(1),
    ignoreQueryString: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("url"),
    operator: z.literal("contains"),
    value: z.string().min(1),
    ignoreQueryString: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("url"),
    operator: z.literal("startsWith"),
    value: z.string().min(1),
    ignoreQueryString: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("url"),
    operator: z.literal("endsWith"),
    value: z.string().min(1),
    ignoreQueryString: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("url"),
    operator: z.literal("matchesRegex"),
    value: z.string().min(1),
    ignoreQueryString: z.boolean().optional(),
  }),
]);

const queryParamRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("queryParam"),
    name: z.string().min(1),
    operator: z.literal("exists"),
  }),
  z.object({
    type: z.literal("queryParam"),
    name: z.string().min(1),
    operator: z.literal("equals"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("queryParam"),
    name: z.string().min(1),
    operator: z.literal("contains"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("queryParam"),
    name: z.string().min(1),
    operator: z.literal("matchesRegex"),
    value: z.string().min(1),
  }),
]);

const screenRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("screen"),
    operator: z.literal("widthAtLeast"),
    value: z.number(),
  }),
  z.object({
    type: z.literal("screen"),
    operator: z.literal("widthAtMost"),
    value: z.number(),
  }),
  z.object({
    type: z.literal("screen"),
    operator: z.literal("heightAtLeast"),
    value: z.number(),
  }),
  z.object({
    type: z.literal("screen"),
    operator: z.literal("heightAtMost"),
    value: z.number(),
  }),
]);

const cityRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("city"),
    operator: z.literal("isAnyOf"),
    values: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("city"),
    operator: z.literal("contains"),
    value: z.string().min(1),
  }),
]);

const browserVersionRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("browserVersion"),
    operator: z.literal("equals"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("browserVersion"),
    operator: z.literal("olderThan"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("browserVersion"),
    operator: z.literal("newerThan"),
    value: z.string().min(1),
  }),
]);

const cookieRuleSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("cookie"),
    name: z.string().min(1),
    operator: z.literal("exists"),
  }),
  z.object({
    type: z.literal("cookie"),
    name: z.string().min(1),
    operator: z.literal("equals"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("cookie"),
    name: z.string().min(1),
    operator: z.literal("contains"),
    value: z.string().min(1),
  }),
]);

const segmentLeafRuleSchema = z.union([
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("country"),
      operator: z.literal("isAnyOf"),
      values: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("device"),
      operator: z.literal("isAnyOf"),
      values: z.array(deviceKindSchema).min(1),
    }),
    z.object({
      type: z.literal("loggedIn"),
      operator: z.literal("equals"),
      value: z.boolean(),
    }),
    z.object({
      type: z.literal("region"),
      operator: z.literal("isAnyOf"),
      values: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("browser"),
      operator: z.literal("isAnyOf"),
      values: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("browserLanguage"),
      operator: z.literal("isAnyOf"),
      values: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("customRule"),
      ruleId: z.string().min(1),
    }),
    z.object({
      type: z.literal("dom"),
      operator: z.literal("exists"),
      presenceKey: z.string().min(1),
    }),
    z.object({
      type: z.literal("visitorType"),
      operator: z.literal("equals"),
      value: z.union([z.literal("new"), z.literal("returning")]),
    }),
  ]),
  urlRuleSchema,
  queryParamRuleSchema,
  screenRuleSchema,
  cityRuleSchema,
  browserVersionRuleSchema,
  cookieRuleSchema,
]);

const segmentConditionSchema: z.ZodType<SegmentCondition> = z.lazy(() =>
  z.union([
    segmentLeafRuleSchema,
    z.object({
      type: z.literal("allOf"),
      conditions: z.array(segmentConditionSchema),
    }),
    z.object({
      type: z.literal("anyOf"),
      conditions: z.array(segmentConditionSchema),
    }),
    z.object({
      type: z.literal("not"),
      condition: segmentConditionSchema,
    }),
  ]),
);

const segmentFileRawSchema = z
  .object({
    id: segmentIdSchema,
    name: z.string(),
    description: z.string().optional(),
    rules: z.array(segmentLeafRuleSchema).optional(),
    condition: segmentConditionSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCondition = data.condition !== undefined;
    const hasRules = data.rules !== undefined;
    if (hasCondition && hasRules) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Segment : utiliser soit "condition", soit "rules", pas les deux.',
        path: ["condition"],
      });
    } else if (!hasCondition && !hasRules) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Segment : fournir "condition" ou "rules" (ex. "rules": [] pour tout le monde).',
      });
    }
  });

export type SegmentFileRawValidated = z.infer<typeof segmentFileRawSchema>;

/**
 * Valide un objet segment tel que dans `config.json` (ou corps API) avant écriture disque.
 */
export function parseSegmentFileForWrite(
  raw: unknown,
):
  | { ok: true; data: SegmentFileRawValidated }
  | { ok: false; error: z.ZodError<unknown> } {
  const result = segmentFileRawSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: result.data };
}

/** JSON à écrire dans `Segments/<dossier>/config.json` (un seul de `condition` / `rules`). */
export function segmentValidatedToDiskJson(
  data: SegmentFileRawValidated,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: data.id,
    name: data.name,
  };
  if (data.description !== undefined && data.description !== "") {
    out.description = data.description;
  }
  if (data.condition !== undefined) {
    out.condition = data.condition;
  } else {
    out.rules = data.rules;
  }
  return out;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return null;
    }
    console.error(`Error reading JSON file at ${filePath}`, error);
    throw error;
  }
}

async function readCampaignConfigs(rootDir: string) {
  const campaignsRoot = path.join(rootDir, "Campaigns");
  let campaignDirs: string[] = [];
  try {
    const entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
    campaignDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const campaigns: z.infer<typeof campaignConfigSchema>[] = [];
  for (const dir of campaignDirs) {
    const configPath = path.join(campaignsRoot, dir, "config.json");
    const rawConfig = await readJsonFile(configPath);
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

async function readSegmentConfigs(rootDir: string) {
  const segmentsRoot = path.join(rootDir, "Segments");
  let segmentDirs: string[] = [];
  try {
    const entries = await fs.readdir(segmentsRoot, { withFileTypes: true });
    segmentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const segments = [];
  for (const dir of segmentDirs) {
    const configPath = path.join(segmentsRoot, dir, "config.json");
    const rawConfig = await readJsonFile(configPath);
    if (!rawConfig) continue;
    const parseResult = segmentFileRawSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      console.warn(
        `Invalid segment config in ${configPath}:`,
        parseResult.error.format(),
      );
      continue;
    }
    segments.push(normalizeRawSegment(parseResult.data));
  }
  return segments;
}

export function createFsStorage(options: { rootDir: string }) {
  const { rootDir } = options;
  return {
    async listCampaigns() {
      return readCampaignConfigs(rootDir);
    },
    async getCampaignById(id: number) {
      const all = await readCampaignConfigs(rootDir);
      return all.find((c) => c.id === id) ?? null;
    },
    async listSegments() {
      return readSegmentConfigs(rootDir);
    },
    async getSegmentById(id: number) {
      const all = await readSegmentConfigs(rootDir);
      return all.find((s) => s.id === id) ?? null;
    },
  };
}
