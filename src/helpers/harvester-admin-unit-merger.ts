import { QueryEngine } from '@comunica/query-sparql';
import { TemplatedSelect } from '../queries/templated-query.js';
import {
  GetGoverningBodiesFromHarvesterInput,
  GetGoverningBodiesFromHarvesterOutput,
  GetGoverningBodiesFromHarvesterTemplate,
} from '../queries/util-queries.js';
import { duration } from '../util/util.js';
import { PREFIXES } from '../local-constants.js';

const CLASS_A =
  'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001'; // Municipality
const CLASS_B =
  'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002'; // OCMW
const CLASS_C =
  'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000000'; // Province

function mergeGovBodies(a: any[], b: any[]) {
  return [...a, ...b];
}

export async function mergeAdminUnitsFromHarvesterEndpoint(
  endpoint: { url: string },
  queryEngine: QueryEngine,
  orgResources: { adminUnits: any[] },
  harvesterAdminUnitMap: Record<string, any[]>,
  countAdminUnits: number
): Promise<{
  harvesterAdminUnitMap: Record<string, any[]>;
  countAdminUnits: number;
}> {
  const testQuery = new TemplatedSelect<
    GetGoverningBodiesFromHarvesterInput,
    GetGoverningBodiesFromHarvesterOutput
  >(queryEngine, endpoint.url, GetGoverningBodiesFromHarvesterTemplate);

  const resultWrapper = await duration(testQuery.records.bind(testQuery))({
    prefixes: PREFIXES,
  });

  const labelSet = new Set(resultWrapper.result.map((r) => r.title.toLowerCase()));

  const updatedMap = { ...harvesterAdminUnitMap };
  updatedMap[endpoint.url] = [...(updatedMap[endpoint.url] ?? [])];

  // Keep track of all existing URIs to avoid accidental duplication
  const existingUris = new Set(updatedMap[endpoint.url].map((u) => u.uri));

  const matchingUnits = orgResources.adminUnits.filter((adminUnit) => {
    const labels = adminUnit.label.split(',').map((l: string) => l.trim().toLowerCase());
    return labels.some((l: string) => labelSet.has(l));
  });

  for (const unit of matchingUnits) {
    // If we’ve already added this admin unit, merge govBodies
    if (existingUris.has(unit.uri)) {
      const existing = updatedMap[endpoint.url].find((u) => u.uri === unit.uri);
      if (existing) {
        existing.govBodies = mergeGovBodies(existing.govBodies, unit.govBodies);
      }
      continue;
    }

    // Otherwise, add it as a new independent unit
    countAdminUnits++;
    updatedMap[endpoint.url].push({ ...unit, govBodies: [...unit.govBodies] });
    existingUris.add(unit.uri);
  }

  return { harvesterAdminUnitMap: updatedMap, countAdminUnits };
}

const normalizeLabel = (label: string) => label.trim().toLowerCase().normalize('NFD');

export function mergeMunicipalityWithOcmw(harvesterAdminUnitMap: Record<string, any[]>) {
  for (const url of Object.keys(harvesterAdminUnitMap)) {
    const units = harvesterAdminUnitMap[url];
    const byLabel = new Map<string, any>();

    // First pass: process non-provinces
    for (const unit of units) {
      const label = normalizeLabel(unit.label);

      // Keep provinces separate
      if (unit.classification === CLASS_C) continue;

      if (!byLabel.has(label)) {
        byLabel.set(label, unit);
      } else {
        const existing = byLabel.get(label);

        // Merge OCMW into Municipality
        if (existing.classification === CLASS_A && unit.classification === CLASS_B) {
          existing.govBodies = mergeGovBodies(existing.govBodies, unit.govBodies);
        } else if (existing.classification === CLASS_B && unit.classification === CLASS_A) {
          const merged = { ...unit, govBodies: mergeGovBodies(unit.govBodies, existing.govBodies) };
          byLabel.set(label, merged);
        } else {
          // Same classification or other combination, merge govBodies
          existing.govBodies = mergeGovBodies(existing.govBodies, unit.govBodies);
        }
      }
    }

    // Combine provinces + merged municipalities/OCMWs
    const provinces = units.filter((u) => u.classification === CLASS_C);
    harvesterAdminUnitMap[url] = [...provinces, ...Array.from(byLabel.values())];
  }

  return harvesterAdminUnitMap;
}
