/**
 * Where things live, and how a source is discovered.
 *
 * A source is any directory under pipeline/sources/ that contains a
 * source.config.json and an extract.mjs. Adding a source means adding a folder.
 * Nothing else in the codebase needs to change, and nothing else can be
 * affected when that folder is wrong.
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = process.cwd();
export const SOURCES_DIR = join(ROOT, 'pipeline', 'sources');
export const DATA_DIR = join(ROOT, 'data');
export const SCHEMA_DIR = join(DATA_DIR, 'schema');
export const PUBLISHED_DIR = join(DATA_DIR, 'published');
export const SNAPSHOT_DIR = join(DATA_DIR, 'snapshots');
export const REPORT_DIR = join(DATA_DIR, 'reports');

/** Record types the pipeline knows how to publish, and where each one lands. */
export const RECORD_TYPES = {
  benefit: { dir: join(PUBLISHED_DIR, 'benefits'), schema: 'benefit.schema.json' },
  organization: { dir: join(PUBLISHED_DIR, 'organizations'), schema: 'organization.schema.json' },
};

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Load one source's config, applying defaults and sanity limits. */
export function loadSourceConfig(id) {
  const dir = join(SOURCES_DIR, id);
  const config = readJson(join(dir, 'source.config.json'));

  if (config.id !== id) {
    throw new Error(`source ${id}: config.id is "${config.id}" but the folder is "${id}"`);
  }
  if (!RECORD_TYPES[config.recordType]) {
    throw new Error(`source ${id}: unknown recordType "${config.recordType}"`);
  }

  return {
    enabled: true,
    timeoutMs: 180000,
    maxRequests: 50,
    delayMs: 1200,
    ...config,
    dir,
    guards: { minRecords: 1, maxDropRatio: 0.34, ...(config.guards || {}) },
  };
}

/** Every source folder that is wired up correctly, sorted for stable runs. */
export function listSources() {
  if (!existsSync(SOURCES_DIR)) return [];
  return readdirSync(SOURCES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const dir = join(SOURCES_DIR, name);
      return existsSync(join(dir, 'source.config.json')) && existsSync(join(dir, 'extract.mjs'));
    })
    .sort();
}

export const publishedPath = (recordType, id) => join(RECORD_TYPES[recordType].dir, `${id}.json`);
export const snapshotPath = (id) => join(SNAPSHOT_DIR, `${id}.json`);
export const reportPath = (id) => join(REPORT_DIR, `${id}.json`);
