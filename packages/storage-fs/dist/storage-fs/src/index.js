"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFsStorage = createFsStorage;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const zod_1 = require("zod");
const variationConfigSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    trafficAllocation: zod_1.z.number().min(0).max(100),
    jsPath: zod_1.z.string().optional(),
    cssPath: zod_1.z.string().optional(),
    featureFlags: zod_1.z.record(zod_1.z.boolean()).optional(),
    pianoEventKey: zod_1.z.string().optional(),
});
const campaignConfigSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    type: zod_1.z.union([zod_1.z.literal("frontend"), zod_1.z.literal("backend")]),
    status: zod_1.z.union([
        zod_1.z.literal("draft"),
        zod_1.z.literal("running"),
        zod_1.z.literal("paused"),
        zod_1.z.literal("stopped"),
    ]),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    segments: zod_1.z.array(zod_1.z.string()),
    variations: zod_1.z.array(variationConfigSchema),
    simulationBaseUrl: zod_1.z.string().optional(),
});
const segmentConfigSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    criteria: zod_1.z.record(zod_1.z.any()),
});
async function readJsonFile(filePath) {
    try {
        const raw = await node_fs_1.promises.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        console.error(`Error reading JSON file at ${filePath}`, error);
        throw error;
    }
}
async function readCampaignConfigs(rootDir) {
    const campaignsRoot = node_path_1.default.join(rootDir, "Campaigns");
    let campaignDirs = [];
    try {
        const entries = await node_fs_1.promises.readdir(campaignsRoot, { withFileTypes: true });
        campaignDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const campaigns = [];
    for (const dir of campaignDirs) {
        const configPath = node_path_1.default.join(campaignsRoot, dir, "config.json");
        const rawConfig = await readJsonFile(configPath);
        if (!rawConfig)
            continue;
        const parseResult = campaignConfigSchema.safeParse(rawConfig);
        if (!parseResult.success) {
            console.warn(`Invalid campaign config in ${configPath}:`, parseResult.error.format());
            continue;
        }
        campaigns.push(parseResult.data);
    }
    return campaigns;
}
async function readSegmentConfigs(rootDir) {
    const segmentsRoot = node_path_1.default.join(rootDir, "Segments");
    let segmentDirs = [];
    try {
        const entries = await node_fs_1.promises.readdir(segmentsRoot, { withFileTypes: true });
        segmentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const segments = [];
    for (const dir of segmentDirs) {
        const configPath = node_path_1.default.join(segmentsRoot, dir, "config.json");
        const rawConfig = await readJsonFile(configPath);
        if (!rawConfig)
            continue;
        const parseResult = segmentConfigSchema.safeParse(rawConfig);
        if (!parseResult.success) {
            console.warn(`Invalid segment config in ${configPath}:`, parseResult.error.format());
            continue;
        }
        segments.push(parseResult.data);
    }
    return segments;
}
function createFsStorage(options) {
    const { rootDir } = options;
    return {
        async listCampaigns() {
            return readCampaignConfigs(rootDir);
        },
        async getCampaignById(id) {
            const all = await readCampaignConfigs(rootDir);
            return all.find((c) => c.id === id) ?? null;
        },
        async listSegments() {
            return readSegmentConfigs(rootDir);
        },
        async getSegmentById(id) {
            const all = await readSegmentConfigs(rootDir);
            return all.find((s) => s.id === id) ?? null;
        },
    };
}
