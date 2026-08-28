/**
 * Loads published data for the site build.
 *
 * This layer is defensive on purpose. The build must succeed even if a data
 * file is missing, empty, truncated by a killed process, or hand-edited into
 * invalid JSON. A bad file becomes a skipped file and a line in the health
 * report. It never becomes a failed deploy, because a failed deploy takes down
 * 56 working jurisdictions to punish one broken one.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RECORD_TYPES, DATA_DIR, readJson } from '../../pipeline/core/registry.mjs';

/** Days after which a record is shown to visitors as possibly out of date. */
export const STALE_AFTER_DAYS = 120;

export const loadIssues = [];

function loadRecordType(type) {
  const { dir } = RECORD_TYPES[type];
  if (!existsSync(dir)) return [];

  const records = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    // Fixture output must never reach the public site, belt and braces.
    if (file.startsWith('zz-test-')) continue;
    try {
      const payload = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (!Array.isArray(payload.records)) throw new Error('no records array');
      records.push(...payload.records);
    } catch (error) {
      loadIssues.push(`${type}/${file}: ${error.message}`);
    }
  }
  return records;
}

export function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.now() - then) / 86400000);
}

export const isStale = (record) => daysSince(record.verifiedAt) > STALE_AFTER_DAYS;

export function loadAll() {
  const { jurisdictions } = readJson(join(DATA_DIR, 'jurisdictions.json'));
  const benefits = loadRecordType('benefit');
  const organizations = loadRecordType('organization');
  const health = readJson(join(DATA_DIR, 'reports', 'health.json'), {
    generatedAt: null, total: 0, ok: 0, warned: 0, failed: 0, sources: [],
  });

  // Test fixtures are deliberately broken sources. They must never appear on
  // the public health page, however they got into the report on disk.
  health.sources = (health.sources ?? []).filter((s) => !s.sourceId.startsWith('zz-test-'));

  const byCode = new Map(jurisdictions.map((j) => [j.code, j]));

  // Attach each jurisdiction's own records once, so pages do not re-filter
  // the full arrays 56 times.
  for (const jurisdiction of jurisdictions) {
    jurisdiction.benefits = [];
    jurisdiction.organizations = [];
  }
  for (const benefit of benefits) byCode.get(benefit.jurisdiction)?.benefits.push(benefit);
  for (const org of organizations) byCode.get(org.jurisdiction)?.organizations.push(org);

  for (const jurisdiction of jurisdictions) {
    jurisdiction.benefits.sort((a, b) => a.title.localeCompare(b.title));
    jurisdiction.organizations.sort((a, b) => a.name.localeCompare(b.name));

    // The state agency is the front door, so surface it rather than burying it
    // in an alphabetical list.
    jurisdiction.stateAgency =
      jurisdiction.organizations.find((o) => o.orgType === 'state-agency') ?? null;
  }

  return { jurisdictions, byCode, benefits, organizations, health, loadIssues };
}

export const ORG_TYPE_LABELS = {
  vso: 'Veterans Service Organization',
  'county-vso': 'County Veteran Service Office',
  'state-agency': 'State Veteran agency',
  'federal-agency': 'Federal agency',
  nonprofit: 'Nonprofit',
  health: 'Health care',
  'legal-aid': 'Legal aid',
  employment: 'Employment',
  housing: 'Housing',
  education: 'Education',
  food: 'Food assistance',
  crisis: 'Crisis support',
  other: 'Other',
};

export const CATEGORY_LABELS = {
  'property-tax': 'Property tax',
  'income-tax': 'Income tax',
  education: 'Education',
  employment: 'Employment',
  health: 'Health care',
  recreation: 'Parks and recreation',
  vehicle: 'Vehicles and licensing',
  housing: 'Housing',
  burial: 'Burial and memorial',
  financial: 'Financial help',
  legal: 'Legal',
  'license-fee': 'License and permit fees',
  family: 'Family and survivors',
  business: 'Business',
  other: 'Other',
};
