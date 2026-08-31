/**
 * Which paid placement runs where.
 *
 * This lives in src/lib/ rather than in the build script because two things
 * need the same answer and they must never disagree: the site generator, which
 * renders the ad, and `npm run status`, which tells you what is sold and what
 * is empty across all 56 jurisdictions. If the report and the site used
 * separate logic, the report would eventually be lying about inventory you are
 * trying to sell.
 *
 * Nothing here filters on flight dates. loadAll() in data.mjs has already
 * dropped anything outside its startsAt and endsAt, so a sponsor reaching this
 * file is live today by definition.
 */

/** Every slot the site renders. Kept in step with the enum in sponsor.schema.json. */
export const SLOTS = ['jurisdiction', 'discounts', 'organizations', 'free-help'];

export const SLOT_LABELS = {
  jurisdiction: 'State and territory pages',
  discounts: 'Discounts page',
  organizations: 'Organization directory',
  'free-help': 'Free help page',
};

/** How many paid placements may appear in one slot on one page. */
export const MAX_ADS_PER_SLOT = 2;

/**
 * Every live sponsor eligible for a slot, best match first.
 *
 * A sponsor with no `jurisdictions` listed is a national buy and runs on all 56
 * pages. One record covers fifty states rather than fifty records, which is the
 * whole reason the field is optional.
 *
 * Ordering rule, and the reason for it: a sponsor that named this jurisdiction
 * outranks a national buy on that jurisdiction's page. Someone who paid to
 * reach Veterans in Arizona should not be pushed off the Arizona page by a
 * national advertiser who merely happened to be created first. Ties break on
 * id, which is unique and stable, so two builds of the same data produce
 * identical pages. Without that, every deploy churns the diff and a real change
 * becomes impossible to spot.
 */
export function eligibleSponsors(sponsors, slot, jurisdictionCode = null) {
  return sponsors
    .filter((s) => {
      if (s.slot !== slot) return false;
      if (slot !== 'jurisdiction') return true;
      if (!s.jurisdictions || s.jurisdictions.length === 0) return true;
      return s.jurisdictions.includes(jurisdictionCode);
    })
    .sort((a, b) => {
      const targeted = (s) => (s.jurisdictions && s.jurisdictions.length > 0 ? 0 : 1);
      return targeted(a) - targeted(b) || a.id.localeCompare(b.id);
    });
}

/** What actually renders in a slot, after the per-slot cap. */
export function placedSponsors(sponsors, slot, jurisdictionCode = null) {
  return eligibleSponsors(sponsors, slot, jurisdictionCode).slice(0, MAX_ADS_PER_SLOT);
}
