/**
 * Hand-verified benefit records.
 *
 * No network access at all. This source exists so a person can publish a
 * benefit without writing a scraper and without touching code: drop a JSON file
 * into data/curated/benefits/ and run the pipeline.
 *
 * It still goes through the same schema gate as everything else. Being written
 * by a human is not a reason to skip validation, it is a reason to expect typos.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanText, cleanUrl } from '../../core/sanitize.mjs';

const CURATED_DIR = join(process.cwd(), 'data', 'curated', 'benefits');

export default async function extract({ log }) {
  if (!existsSync(CURATED_DIR)) {
    log(`no curated directory at ${CURATED_DIR}, publishing nothing`);
    return [];
  }

  const files = readdirSync(CURATED_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const records = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(CURATED_DIR, file), 'utf8'));
    } catch (error) {
      // One malformed file must not discard every other curated record.
      log(`SKIPPED ${file}: not valid JSON (${error.message})`);
      continue;
    }

    const list = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(list)) {
      log(`SKIPPED ${file}: expected an array of records, or an object with a records array`);
      continue;
    }

    for (const entry of list) {
      // Curated text is still cleaned. The author may have pasted from a PDF,
      // which is a reliable way to import non-breaking spaces and stray markup.
      const record = {
        ...entry,
        title: cleanText(entry.title),
        summary: cleanText(entry.summary),
        confidence: entry.confidence ?? 'verified',
      };
      if (entry.details) record.details = entry.details.map(cleanText).filter(Boolean);
      if (entry.eligibility) record.eligibility = entry.eligibility.map(cleanText).filter(Boolean);
      if (entry.amount) record.amount = cleanText(entry.amount);
      if (entry.agency) record.agency = cleanText(entry.agency);
      if (entry.officialUrl) record.officialUrl = cleanUrl(entry.officialUrl);
      if (entry.applyUrl) record.applyUrl = cleanUrl(entry.applyUrl);

      records.push(record);
    }
    log(`${file}: ${list.length} record(s)`);
  }

  log(`${records.length} curated benefit(s) from ${files.length} file(s)`);
  return records;
}
