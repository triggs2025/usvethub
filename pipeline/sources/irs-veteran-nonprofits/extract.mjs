/**
 * Veteran-serving nonprofits, from the IRS Exempt Organizations Business Master
 * File via ProPublica's Nonprofit Explorer API.
 *
 * Why this and not a web scrape: the BMF is the authoritative federal registry
 * of every tax-exempt organization in the country. Scraping charity directories
 * would give us somebody else's editorial choices, stale copies, and no EIN.
 * This gives the real list, with the one identifier that never changes.
 *
 * Two judgement calls are baked in, and both trade completeness for usefulness:
 *
 *   1. ACTIVITY, and this one is a KNOWN GAP. The BMF contains many
 *      organizations that registered once and never filed since. The search
 *      endpoint returns have_filings as null on every record, so it cannot be
 *      used as a gate without one API call per EIN, which is thousands of
 *      requests. Every record therefore links to its ProPublica page where the
 *      filing history is visible, and the directory says so rather than
 *      implying every listing is active.
 *
 *   2. RELEVANCE. NTEE W30 is "Military and Veterans Organizations" and is the
 *      cleanest signal, but plenty of genuinely Veteran-serving charities file
 *      under human services, housing, or mental health. So a keyword pass runs
 *      alongside the W30 pass, and anything it finds must name Veterans or the
 *      military in its own registered name to qualify.
 */
import { cleanText, slugify } from '../../core/sanitize.mjs';

const API = 'https://projects.propublica.org/nonprofits/api/v2/search.json';

const JURISDICTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC', 'PR', 'GU', 'VI', 'AS', 'MP',
];

/** Pages of 25 to pull per query per state. Keeps one state from eating the budget. */
const MAX_PAGES = 4;

/**
 * Only these 501(c) subsections. c3 is a public charity and donations are
 * deductible; c4 is social welfare and they generally are not. c19 is included
 * because that is the subsection for posts and organizations of past or present
 * members of the armed forces, which is where the VFW and American Legion posts
 * live and is squarely on topic.
 */
const ALLOWED_SUBSECTIONS = new Set([3, 4, 19]);

/** A keyword hit must have one of these in the registered name to count. */
const NAME_MUST_MATCH = /\b(veteran|veterans|vets?|military|armed forces|servicemember|service member|gold star|purple heart|wounded warrior|american legion|vfw|amvets|dav|disabled american)\b/i;

/** Obvious false positives from a plain keyword search. */
const NAME_MUST_NOT_MATCH = /\b(veterinary|veterinarian|veterinarians)\b/i;

export default async function extract({ fetchJson, log }) {
  const byEin = new Map();
  let requests = 0;

  for (const state of JURISDICTIONS) {
    // Two passes per state. The W30 pass is precise; the keyword pass catches
    // Veteran charities filed under other NTEE codes.
    // Several terms per state. A single "veterans" query misses posts named
    // "American Legion Post 41" or "VFW Auxiliary", which are exactly the
    // organizations a Veteran is most likely to walk into.
    const queries = ['veterans', 'military', 'american legion'].map((term) => ({
      label: term,
      params: `q=${encodeURIComponent(term)}&state%5Bid%5D=${state}`,
    }));

    let addedForState = 0;

    for (const query of queries) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        let payload;
        try {
          payload = await fetchJson(`${API}?${query.params}&page=${page}`);
          requests += 1;
        } catch (error) {
          // One bad page must not abandon the other 55 states.
          log(`${state} ${query.label} page ${page}: ${error.message}`);
          break;
        }

        const orgs = payload?.organizations ?? [];
        if (orgs.length === 0) break;

        for (const org of orgs) {
          const ein = String(org.ein ?? '').replace(/\D/g, '').padStart(9, '0');
          if (ein.length !== 9 || byEin.has(ein)) continue;

          // Prefer sub_name. The BMF puts the parent organisation in `name`, so
          // every American Legion post in a state comes back as "American
          // Legion", which produces a page of identical rows a Veteran cannot
          // tell apart. `sub_name` carries the post identity: "American Legion
          // 41 Syracuse". Use it whenever it says more than the parent name.
          const parentName = cleanText(org.name);
          const subName = cleanText(org.sub_name);
          const name = subName && subName.length > parentName.length ? subName : parentName;
          if (!name || name.length < 3) continue;
          if (!NAME_MUST_MATCH.test(name) || NAME_MUST_NOT_MATCH.test(name)) continue;

          const subsection = Number(org.subseccd);
          if (!ALLOWED_SUBSECTIONS.has(subsection)) continue;

          // NOTE: the search endpoint returns have_filings as null for every
          // record, so it cannot be used as an activity gate here. Confirming
          // whether an organization actually files would need one API call per
          // EIN, which is thousands of requests. Instead every record links to
          // its ProPublica page, where the filing history is visible, and the
          // limitation is stated on the page rather than hidden.

          const record = {
            // Trailing hyphens must be stripped AFTER truncation, or a name cut at
            // a word boundary yields "...american--9036", which fails the id pattern.
            id: `${slugify(name).slice(0, 74).replace(/-+$/, "")}-${ein.slice(-4)}`,
            name,
            orgType: 'nonprofit',
            jurisdiction: state,
            confidence: 'scraped',
            ein,
            irsSubsection: subsection,

            // Links straight to the organization's 990 filings. Financial
            // transparency is far harder to game than a star rating, and
            // Veteran charities have a long history of fundraising scandals.
            website: `https://projects.propublica.org/nonprofits/organizations/${ein}`,
          };

          const city = cleanText(org.city);
          if (city) record.city = city;
          if (org.ntee_code) record.nteeCode = cleanText(org.ntee_code).slice(0, 10);

          record.description =
            subsection === 3
              ? 'Registered 501(c)(3) public charity. Donations are generally tax deductible. Financial filings linked below.'
              : subsection === 4
                ? 'Registered 501(c)(4) social welfare organization. Donations are generally NOT tax deductible. Financial filings linked below.'
                : 'Registered 501(c)(19) organization of past or present members of the armed forces. Financial filings linked below.';

          byEin.set(ein, record);
          addedForState += 1;
        }

        if (orgs.length < 25) break;
      }
    }

    log(`${state}: ${addedForState} organization(s), ${byEin.size} total so far`);
  }

  const records = [...byEin.values()];
  const c3 = records.filter((r) => r.irsSubsection === 3).length;
  const c4 = records.filter((r) => r.irsSubsection === 4).length;
  const c19 = records.filter((r) => r.irsSubsection === 19).length;
  records.sort((a, b) => a.name.localeCompare(b.name));
  log(`${records.length} nonprofits after filtering. c3=${c3} c4=${c4} c19=${c19}. ${requests} requests used.`);

  return records;
}
