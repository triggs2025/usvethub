/**
 * State Departments of Veterans Affairs, from VA's own directory.
 *
 * This is the single most useful record set on the site: for any Veteran, the
 * state agency is the front door to every state-level benefit. It is also the
 * spine of our data model, since the agency site is where the state benefit
 * scrapers start.
 *
 * Uses the public WordPress REST API behind discover.va.gov. That is a
 * deliberate choice over parsing the rendered page: the API hands back typed
 * fields, so a visual redesign does not break us, and it costs one request
 * instead of thirty.
 */
import { cleanText, cleanUrl, cleanPhone, cleanEmail, slugify } from '../../core/sanitize.mjs';

const ENDPOINT = 'https://discover.va.gov/wp-json/wp/v2/external-orgs';
const STATE_OFFICE_CATEGORY = 'external-org-category-state-veterans-affairs-office';

/** Jurisdiction codes we publish. Anything else is a data error upstream. */
const VALID_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC','PR','GU','VI','AS','MP',
]);

export default async function extract({ fetchJson, log }) {
  const records = [];
  const seenIds = new Set();

  // per_page maxes out at 100 and there are ~60 records, so this is one page in
  // practice. The loop exists so a growing directory does not silently truncate.
  for (let page = 1; page <= 5; page += 1) {
    const batch = await fetchJson(`${ENDPOINT}?per_page=100&page=${page}&_fields=slug,title,link,class_list,meta_box`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    log(`page ${page}: ${batch.length} organization(s)`);

    for (const entry of batch) {
      const meta = entry.meta_box || {};
      const classes = Array.isArray(entry.class_list) ? entry.class_list : [];

      // Two independent signals that this is a state office. Requiring both
      // keeps unrelated organizations out if VA reuses the post type.
      const isStateOffice =
        classes.includes(STATE_OFFICE_CATEGORY) || meta.is_this_a_state_office === '1';
      if (!isStateOffice) continue;

      const code = cleanText(meta.state_office_location).toUpperCase();
      if (!VALID_CODES.has(code)) {
        log(`skipped "${cleanText(entry.title?.rendered)}": unrecognized location "${code}"`);
        continue;
      }

      const name = cleanText(entry.title?.rendered);
      if (!name) continue;

      // Several states list more than one office, so the state code alone is
      // not unique. Fall back to the source slug, which is.
      let id = slugify(entry.slug || name);
      if (seenIds.has(id)) id = `${id}-${seenIds.size}`;
      seenIds.add(id);

      const record = {
        id,
        name,
        orgType: 'state-agency',
        jurisdiction: code,
        confidence: 'scraped',
      };

      const website = cleanUrl(meta.website);
      const phone = cleanPhone(meta.main_phone) || cleanPhone(meta.alt_phone);
      const email = cleanEmail(meta.main_email_address);
      const description = cleanText(meta.short_description);

      if (website) record.website = website;
      if (phone) record.phone = phone;
      if (email) record.email = email;
      if (description) record.description = description.slice(0, 1500);

      record.services = ['State Veteran benefits', 'Claims assistance referral'];

      // A state office with no website and no phone is not actionable for a
      // Veteran, which is the only test that matters here.
      if (!record.website && !record.phone) {
        log(`skipped "${name}": no website and no phone, not actionable`);
        continue;
      }

      records.push(record);
    }

    if (batch.length < 100) break;
  }

  const covered = new Set(records.map((r) => r.jurisdiction));
  const missing = [...VALID_CODES].filter((code) => !covered.has(code)).sort();
  log(`${records.length} state office(s) across ${covered.size} of 56 jurisdictions`);
  if (missing.length) log(`no state office found for: ${missing.join(', ')}`);

  return records;
}
