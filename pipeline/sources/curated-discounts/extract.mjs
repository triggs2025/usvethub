/**
 * Hand-verified discount records.
 *
 * No network access. Reads JSON from data/curated/discounts/ so a person can
 * publish without writing a scraper or touching code. Still passes the same
 * schema gate as everything else: being written by a human is a reason to
 * expect typos, not a reason to skip validation.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanText, cleanUrl } from '../../core/sanitize.mjs';

const DIR = join(process.cwd(), 'data', 'curated', 'discounts');

export default async function extract({ log }) {
  if (!existsSync(DIR)) {
    log(`no curated directory at ${DIR}, publishing nothing`);
    return [];
  }

  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const records = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    } catch (error) {
      // One malformed file must not discard every other curated record.
      log(`SKIPPED ${file}: not valid JSON (${error.message})`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(list)) {
      log(`SKIPPED ${file}: expected an array of records`);
      continue;
    }
    for (const entry of list) {
      const record = { ...entry };
      // Curated text is still cleaned. Authors paste from PDFs and email, which
      // is a reliable way to import non-breaking spaces and stray markup.
      for (const key of ['business', 'summary', 'offer', 'howToRedeem', 'advertiser', 'headline', 'body', 'ctaLabel', 'city', 'verificationService', 'notes', 'policyReviewedBy', 'imageAlt']) {
        if (typeof record[key] === 'string') record[key] = cleanText(record[key]);
      }
      for (const key of ['officialUrl', 'destinationUrl']) {
        if (record[key]) record[key] = cleanUrl(record[key]);
      }
      if (Array.isArray(record.eligibility)) record.eligibility = record.eligibility.map(cleanText).filter(Boolean);
      records.push(record);
    }
    log(`${file}: ${list.length} record(s)`);
  }

  log(`${records.length} curated discount(s) from ${files.length} file(s)`);
  return records;
}
