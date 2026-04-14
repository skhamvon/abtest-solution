#!/usr/bin/env node
/**
 * Squelettes campagne / segment avec allocation d’ID (plages alignées sur packages/core/src/ids.ts).
 *
 * Usage :
 *   npm run scaffold:segment -- "Nom du segment"
 *   npm run scaffold:campaign -- "Nom de la campagne" [frontend|backend]
 *
 * Optionnel : forcer un ID encore libre
 *   node scripts/scaffold-data.mjs segment "France B2B" --id 1042
 *   node scripts/scaffold-data.mjs campaign "Test pricing" frontend --id 10005
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ——— Plages (garder cohérent avec @abtest-solution/core ids.ts) ———
const SEGMENT_ID_MIN = 1000;
const SEGMENT_ID_MAX = 9999;
const CAMPAIGN_ID_MIN = 10000;
const CAMPAIGN_ID_MAX = 99999;

function variationIdForSlot(campaignId, slot) {
  return campaignId * 10 + slot;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(REPO_ROOT, 'abtest-campaigns-segments');

function folderSlug(name) {
  return (
    name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled'
  );
}

function parseArgs(argv) {
  const out = { kind: null, name: null, type: 'frontend', forceId: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--id' && argv[i + 1]) {
      out.forceId = Number(argv[i + 1]);
      i += 1;
    } else {
      rest.push(a);
    }
  }
  if (rest.length < 2) return { error: 'Arguments insuffisants.' };
  out.kind = rest[0];
  out.name = rest[1];
  if (out.kind === 'campaign' && rest[2]) {
    if (rest[2] === 'frontend' || rest[2] === 'backend') out.type = rest[2];
    else return { error: `Type inconnu : ${rest[2]} (frontend|backend)` };
  }
  if (out.kind !== 'segment' && out.kind !== 'campaign') {
    return {
      error: `Premier argument : segment | campaign (reçu : ${out.kind})`,
    };
  }
  if (!out.name?.trim()) return { error: 'Nom vide.' };
  if (
    out.forceId !== null &&
    (!Number.isInteger(out.forceId) || out.forceId < 0)
  ) {
    return { error: `--id doit être un entier.` };
  }
  return out;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function collectIdsUnder(rootSubdir, idKey, min, max) {
  const root = path.join(DATA_ROOT, rootSubdir);
  const used = new Set();
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return used;
    throw e;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const cfg = await readJsonIfExists(
      path.join(root, ent.name, 'config.json')
    );
    if (!cfg || typeof cfg[idKey] !== 'number') continue;
    const id = cfg[idKey];
    if (Number.isInteger(id) && id >= min && id <= max) used.add(id);
  }
  return used;
}

function nextFreeId(used, min, max) {
  for (let n = min; n <= max; n += 1) {
    if (!used.has(n)) return n;
  }
  return null;
}

function usage() {
  console.error(`
Usage:
  npm run scaffold:segment -- "Nom du segment"
  npm run scaffold:campaign -- "Nom" [frontend|backend]

Forcer un ID (doit être libre et dans la plage) :
  node scripts/scaffold-data.mjs segment "Nom" --id 1042
  node scripts/scaffold-data.mjs campaign "Nom" frontend --id 10005
`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(1);
  }

  const { kind, name, type, forceId } = parsed;

  if (kind === 'segment') {
    const used = await collectIdsUnder(
      'Segments',
      'id',
      SEGMENT_ID_MIN,
      SEGMENT_ID_MAX
    );
    let id =
      forceId !== null
        ? forceId
        : nextFreeId(used, SEGMENT_ID_MIN, SEGMENT_ID_MAX);
    if (id === null) {
      console.error('Aucun ID segment libre (1000–9999).');
      process.exit(1);
    }
    if (id < SEGMENT_ID_MIN || id > SEGMENT_ID_MAX || !Number.isInteger(id)) {
      console.error(
        `ID segment hors plage ${SEGMENT_ID_MIN}–${SEGMENT_ID_MAX}.`
      );
      process.exit(1);
    }
    if (used.has(id)) {
      console.error(`ID segment ${id} déjà utilisé.`);
      process.exit(1);
    }

    const dir = path.join(DATA_ROOT, 'Segments', folderSlug(name));
    const segCfg = path.join(dir, 'config.json');
    try {
      await fs.access(segCfg);
      console.error(`Existe déjà : ${segCfg}`);
      process.exit(1);
    } catch {
      // ok
    }
    await fs.mkdir(dir, { recursive: true });

    const config = {
      id,
      name: name.trim(),
      description: '',
      rules: [],
    };
    await fs.writeFile(segCfg, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log(`Segment créé : ${segCfg} (id ${id})`);
    return;
  }

  // campaign
  const used = await collectIdsUnder(
    'Campaigns',
    'id',
    CAMPAIGN_ID_MIN,
    CAMPAIGN_ID_MAX
  );
  let id =
    forceId !== null
      ? forceId
      : nextFreeId(used, CAMPAIGN_ID_MIN, CAMPAIGN_ID_MAX);
  if (id === null) {
    console.error('Aucun ID campagne libre (10000–99999).');
    process.exit(1);
  }
  if (id < CAMPAIGN_ID_MIN || id > CAMPAIGN_ID_MAX || !Number.isInteger(id)) {
    console.error(
      `ID campagne hors plage ${CAMPAIGN_ID_MIN}–${CAMPAIGN_ID_MAX}.`
    );
    process.exit(1);
  }
  if (used.has(id)) {
    console.error(`ID campagne ${id} déjà utilisé.`);
    process.exit(1);
  }

  const dir = path.join(DATA_ROOT, 'Campaigns', folderSlug(name));
  try {
    await fs.access(path.join(dir, 'config.json'));
    console.error(`Existe déjà : ${dir}/config.json`);
    process.exit(1);
  } catch {
    // ok
  }
  await fs.mkdir(dir, { recursive: true });

  const campaignFolderSlug = path.basename(dir);
  const basePublicUrl = `http://localhost:5001/Campaigns/${campaignFolderSlug}`;

  /** Variation non-contrôle : dossier d’assets servi par le remote (port 5001 en dev). */
  const defaultVariantDir = 'variant-1';

  const variations = [
    {
      id: variationIdForSlot(id, 0),
      name: 'Original',
      trafficAllocation: 50,
    },
    {
      id: variationIdForSlot(id, 1),
      name: 'Variation 1',
      trafficAllocation: 50,
    },
  ];

  const sharedDir = 'shared';
  let sharedPaths = null;

  if (type === 'frontend') {
    const shDir = path.join(dir, sharedDir);
    await fs.mkdir(shDir, { recursive: true });
    await fs.writeFile(
      path.join(shDir, 'script.js'),
      `// JS commun — toutes les variations (scaffold CLI)
console.info('[abtest] Script commun chargé (campagne ${id})');
`,
      'utf8'
    );
    await fs.writeFile(
      path.join(shDir, 'style.css'),
      `/* CSS commun — toutes les variations (scaffold CLI) */
`,
      'utf8'
    );
    sharedPaths = {
      sharedJsPath: `${basePublicUrl}/${sharedDir}/script.js`,
      sharedCssPath: `${basePublicUrl}/${sharedDir}/style.css`,
    };

    const vaDir = path.join(dir, defaultVariantDir);
    await fs.mkdir(vaDir, { recursive: true });
    await fs.writeFile(
      path.join(vaDir, 'script.js'),
      `// Variation 1 — squelette (scaffold CLI)
console.info('[abtest] Variation 1 chargée (campagne ${id})');
document.documentElement.classList.add('abtest-variation-1');
`,
      'utf8'
    );
    await fs.writeFile(
      path.join(vaDir, 'style.css'),
      `/* Variation 1 — styles (scaffold CLI) */
html.abtest-variation-1 {
  /* exemple : --abtest-accent: #6366f1; */
}
`,
      'utf8'
    );
    variations[1].jsPath = `${basePublicUrl}/${defaultVariantDir}/script.js`;
    variations[1].cssPath = `${basePublicUrl}/${defaultVariantDir}/style.css`;
  }

  const config = {
    id,
    name: name.trim(),
    type,
    status: 'draft',
    segments: [],
    ...(sharedPaths ?? {}),
    variations,
  };
  await fs.writeFile(
    path.join(dir, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8'
  );
  console.log(`Campagne créée : ${dir}/config.json (id ${id})`);
  console.log(
    `Variations : ${variationIdForSlot(id, 0)} (contrôle), ${variationIdForSlot(
      id,
      1
    )}`
  );
  if (type === 'frontend') {
    console.log(
      `Assets commun : ${dir}/${sharedDir}/ — assets variation 1 : ${dir}/${defaultVariantDir}/ (URLs remote dev, port 5001)`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
