import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  mergeAdminUnitsFromHarvesterEndpoint,
  mergeMunicipalityWithOcmw,
} from './harvester-admin-unit-merger.js';
import { getOrgResoucesCached } from '../job/get-org-data.js';
import { config } from '../configuration.js';

const CACHE_FILE = path.resolve(__dirname, '../cache/harvesterAdminUnits.json');

interface HarvesterCache {
  harvesterAdminUnitMap: Record<string, any[]>;
  countAdminUnits: number;
  lastUpdated: string;
}

let cachedData: HarvesterCache | null = null;

/**
 * Runs the merge once for all endpoints and returns the merged map.
 */
async function runMergeForAllEndpoints(queryEngine: any): Promise<HarvesterCache> {
  let countAdminUnits = 0;
  let harvesterAdminUnitMap: Record<string, any[]> = {};
  const orgResources = await getOrgResoucesCached(queryEngine);
  for (const endpoint of config.file.harvesterEndpoints) {
    const result = await mergeAdminUnitsFromHarvesterEndpoint(
      endpoint,
      queryEngine,
      orgResources,
      harvesterAdminUnitMap,
      countAdminUnits
    );

    harvesterAdminUnitMap = mergeMunicipalityWithOcmw(result.harvesterAdminUnitMap);
    let labelCount = 0;

    for (const adminUnits of Object.values(result.harvesterAdminUnitMap)) {
      labelCount += adminUnits.length;
    }
    countAdminUnits = labelCount;
  }

  const result: HarvesterCache = {
    harvesterAdminUnitMap,
    countAdminUnits,
    lastUpdated: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(result, null, 2), 'utf-8');

  // cachedData = result;
  return result;
}

/**
 * Load cache from file if available.
 */
async function loadCache(): Promise<HarvesterCache | null> {
  if (cachedData) return cachedData;

  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw) as HarvesterCache;
    cachedData = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * Public function to get harvester admin units.
 * Will use cache if available, otherwise run merge.
 */
export async function getHarvesterAdminUnits(queryEngine: any): Promise<HarvesterCache> {
  const cache = await loadCache();
  if (cache && Object.keys(cache.harvesterAdminUnitMap).length > 0) {
    return cache;
  }

  return runMergeForAllEndpoints(queryEngine);
}

/**
 * Start background schedule to refresh the cache every day.
 */
export async function scheduleDailyRefresh(queryEngine: any) {
  // Run immediately on startup
  let fileExists = false;
  try {
    await fs.access(CACHE_FILE);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    cachedData = await runMergeForAllEndpoints(queryEngine);
  }
  // Then schedule every 24h
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      cachedData = null; // 🔥 Force reload
      cachedData = await runMergeForAllEndpoints(queryEngine);
      console.log('✅ Refreshed harvester cache');
    } catch (err) {
      console.error('Failed to refresh daily merge:', err);
    }
  }, ONE_DAY_MS);
  return cachedData;
}
