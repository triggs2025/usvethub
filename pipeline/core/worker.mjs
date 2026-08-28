/**
 * Runs exactly ONE source, in its own process.
 *
 * This file is the blast wall. Everything a source can do wrong happens in
 * here: throwing, hanging, looping forever, allocating until the heap dies,
 * returning nonsense. None of it can reach another source, and none of it can
 * break the website, because:
 *
 *   1. The parent spawns this in a child process and kills it on timeout.
 *   2. A source writes only to its own file, named after its own id.
 *   3. Output must pass the schema before it is published.
 *   4. Output must pass the change guards before it replaces good data.
 *   5. On any failure the previously published file is left exactly as it was.
 *
 * A broken scraper therefore produces stale data and a loud report, never a
 * broken page and never a wrong page.
 *
 * Usage: node pipeline/core/worker.mjs <source-id>
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createClient } from './fetch.mjs';
import { validate } from './validate.mjs';
import { cleanText } from './sanitize.mjs';
import {
  RECORD_TYPES, SCHEMA_DIR, loadSourceConfig, publishedPath, snapshotPath,
  readJson, writeJson,
} from './registry.mjs';

const sourceId = process.argv[2];
if (!sourceId) {
  console.error('worker requires a source id');
  process.exit(2);
}

const startedAt = new Date();
const logLines = [];
const log = (message) => {
  const line = `[${sourceId}] ${message}`;
  logLines.push(line);
  console.error(line);
};

/** The report is the product of this process. The parent reads it from stdout. */
function finish(report) {
  process.stdout.write(JSON.stringify({ ...report, sourceId, log: logLines }));
  process.exit(report.status === 'failed' ? 1 : 0);
}

try {
  const config = loadSourceConfig(sourceId);
  const { dir: recordDir, schema: schemaFile } = RECORD_TYPES[config.recordType];
  const schema = readJson(join(SCHEMA_DIR, schemaFile));

  const client = createClient({
    maxRequests: config.maxRequests,
    delayMs: config.delayMs,
    timeoutMs: config.requestTimeoutMs ?? 20000,
    log,
  });

  const module = await import(pathToFileURL(join(config.dir, 'extract.mjs')).href);
  if (typeof module.default !== 'function') {
    throw new Error('extract.mjs must default-export an async function');
  }

  const raw = await module.default({
    config,
    log,
    fetchText: client.fetchText,
    fetchJson: client.fetchJson,
  });

  if (!Array.isArray(raw)) {
    throw new Error(`extract() returned ${typeof raw}, expected an array of records`);
  }

  // -- Stamp provenance. A source cannot opt out of saying where data came from.
  const runDate = startedAt.toISOString().slice(0, 10);
  const records = raw.map((record) => ({
    ...record,
    source: { id: sourceId, title: cleanText(config.title), homepage: config.homepage },
    verifiedAt: runDate,
  }));

  // -- Gate 1: schema. A record that fails is dropped, not published.
  const valid = [];
  const rejected = [];
  for (const record of records) {
    const errors = validate(record, schema);
    if (errors.length === 0) valid.push(record);
    else rejected.push({ id: record.id ?? '(no id)', errors: errors.slice(0, 4) });
  }
  if (rejected.length) {
    log(`${rejected.length} record(s) failed schema validation and were dropped`);
  }

  // -- Gate 2: duplicate ids would silently overwrite each other downstream.
  const seen = new Set();
  const unique = valid.filter((record) => {
    if (seen.has(record.id)) {
      log(`duplicate id "${record.id}" dropped`);
      return false;
    }
    seen.add(record.id);
    return true;
  });

  // -- Gate 3: change magnitude. This is what catches a site redesign.
  // A scraper that suddenly finds 2 records where it used to find 40 has not
  // discovered that 38 benefits were repealed. It has broken.
  const outPath = publishedPath(config.recordType, sourceId);
  const previous = readJson(outPath, null);
  const previousCount = previous?.records?.length ?? 0;
  const { minRecords, maxDropRatio } = config.guards;

  if (unique.length < minRecords) {
    finish({
      status: 'failed',
      reason: `guard: got ${unique.length} record(s), minimum is ${minRecords}`,
      published: false, recordCount: unique.length, previousCount, rejected,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      requestsUsed: client.requestsUsed,
    });
  }

  if (previousCount > 0) {
    const dropRatio = (previousCount - unique.length) / previousCount;
    if (dropRatio > maxDropRatio) {
      finish({
        status: 'failed',
        reason:
          `guard: record count fell from ${previousCount} to ${unique.length}, ` +
          `a ${Math.round(dropRatio * 100)}% drop, over the ${Math.round(maxDropRatio * 100)}% limit. ` +
          'Previously published data was kept. Check whether the source site changed.',
        published: false, recordCount: unique.length, previousCount, rejected,
        startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
        requestsUsed: client.requestsUsed,
      });
    }
  }

  // -- Publish. Sorted so the committed diff shows real changes, not reordering.
  unique.sort((a, b) => a.id.localeCompare(b.id));
  const payload = {
    sourceId,
    recordType: config.recordType,
    jurisdiction: config.jurisdiction ?? null,
    generatedAt: startedAt.toISOString(),
    records: unique,
  };

  if (previous) writeJson(snapshotPath(sourceId), previous); // one step of rollback
  writeJson(outPath, payload);

  const unchanged =
    previous && JSON.stringify(previous.records) === JSON.stringify(unique);
  log(`published ${unique.length} record(s) to ${outPath.replace(process.cwd(), '.')}`);

  finish({
    status: rejected.length ? 'warned' : 'ok',
    reason: rejected.length ? `${rejected.length} record(s) dropped by schema validation` : null,
    published: true, unchanged: Boolean(unchanged),
    recordCount: unique.length, previousCount, rejected,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    requestsUsed: client.requestsUsed,
  });
} catch (error) {
  finish({
    status: 'failed',
    reason: `${error.name}: ${error.message}`,
    stack: String(error.stack || '').split('\n').slice(0, 6).join('\n'),
    published: false,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  });
}
