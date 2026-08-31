/**
 * Input validation for the admin API.
 *
 * This exists as a separate, dependency-free module for one reason: the rules
 * here have to match data/schema/sponsor.schema.json, and a mismatch is the
 * failure mode that matters. If this is looser than the schema, the export
 * produces a file that the pipeline rejects, and someone finds out at scrape
 * time. If it is tighter, a legitimate sale cannot be recorded.
 *
 * Everything is validated on the way IN. Nothing trusts the client, including
 * the admin UI this Worker serves itself, because "our own form sends it" stops
 * being true the moment anyone opens a console.
 */

export const SLOTS = ['jurisdiction', 'discounts', 'organizations', 'free-help'];

export const ADVERTISER_CATEGORIES = [
  'claims-representation', 'legal-other', 'education', 'employment', 'housing',
  'financial', 'health', 'retail', 'nonprofit', 'government', 'other',
];

export const JURISDICTION_CODES = [
  'AL', 'AK', 'AS', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'GU',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
  'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'MP', 'OH',
  'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'VI', 'UT', 'VT', 'VA',
  'WA', 'WV', 'WI', 'WY',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Only https, and only a hostname.
 *
 * `javascript:` is the obvious one to refuse, but so are `data:` and anything
 * with credentials in it. This runs on a destination URL that will be put in
 * front of Veterans, so the bar is "boring public web address" and nothing else.
 */
export function badUrl(value, field) {
  if (typeof value !== 'string' || value.length === 0) return `${field} is required`;
  if (value.length > 2000) return `${field} is too long`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return `${field} is not a valid URL`;
  }
  if (url.protocol !== 'https:') return `${field} must be https`;
  if (url.username || url.password) return `${field} must not contain credentials`;
  if (!url.hostname.includes('.')) return `${field} needs a real hostname`;
  return null;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Validate a sponsor as submitted by the admin UI.
 *
 * Returns `{ errors, value }`. A non-empty `errors` array means nothing is
 * written. The policy checks are in here rather than only at approval time,
 * because a draft that can never lawfully run is worth catching while someone
 * is still typing it.
 */
export function validateSponsor(input) {
  const errors = [];
  const v = {};

  v.id = str(input.id).toLowerCase();
  if (!ID.test(v.id) || v.id.length < 3 || v.id.length > 90) {
    errors.push('id must be 3 to 90 characters, lowercase letters, numbers and hyphens');
  }

  v.advertiser = str(input.advertiser);
  if (v.advertiser.length < 2 || v.advertiser.length > 160) {
    errors.push('advertiser must be 2 to 160 characters');
  }

  v.slot = str(input.slot);
  if (!SLOTS.includes(v.slot)) errors.push(`slot must be one of ${SLOTS.join(', ')}`);

  v.headline = str(input.headline);
  if (v.headline.length < 4 || v.headline.length > 90) {
    errors.push('headline must be 4 to 90 characters');
  }

  v.body = str(input.body);
  if (v.body.length > 300) errors.push('body must be 300 characters or fewer');

  v.ctaLabel = str(input.ctaLabel);
  if (v.ctaLabel.length > 40) errors.push('ctaLabel must be 40 characters or fewer');

  v.destinationUrl = str(input.destinationUrl);
  const urlError = badUrl(v.destinationUrl, 'destinationUrl');
  if (urlError) errors.push(urlError);

  // A creative must be a file we downloaded and serve ourselves. A hotlinked
  // image is a third-party request that can be swapped for something else after
  // it was approved, which is the whole reason the site refuses one.
  v.image = str(input.image);
  if (v.image && !/^\/sponsors\/[a-z0-9][a-z0-9._-]*$/.test(v.image)) {
    errors.push('image must be a self-hosted path under /sponsors/, never the advertiser\'s URL');
  }
  v.imageAlt = str(input.imageAlt);
  if (v.image && !v.imageAlt) errors.push('imageAlt is required when there is an image');
  if (v.imageAlt.length > 200) errors.push('imageAlt must be 200 characters or fewer');

  v.startsAt = str(input.startsAt);
  v.endsAt = str(input.endsAt);
  if (!DATE.test(v.startsAt)) errors.push('startsAt must be YYYY-MM-DD');
  if (!DATE.test(v.endsAt)) errors.push('endsAt must be YYYY-MM-DD');
  if (DATE.test(v.startsAt) && DATE.test(v.endsAt) && v.endsAt < v.startsAt) {
    errors.push('endsAt is before startsAt');
  }

  // Targeting only means something on the jurisdiction slot. Silently ignoring
  // it elsewhere would let someone believe they had sold a state-targeted buy.
  const codes = Array.isArray(input.jurisdictions)
    ? input.jurisdictions.map((c) => str(c).toUpperCase()).filter(Boolean)
    : [];
  if (codes.length && v.slot !== 'jurisdiction') {
    errors.push('jurisdictions only apply to the jurisdiction slot');
  }
  const unknown = codes.filter((c) => !JURISDICTION_CODES.includes(c));
  if (unknown.length) errors.push(`unknown jurisdiction code: ${unknown.join(', ')}`);
  v.jurisdictions = [...new Set(codes)].sort();

  v.advertiserCategory = str(input.advertiserCategory);
  if (v.advertiserCategory && !ADVERTISER_CATEGORIES.includes(v.advertiserCategory)) {
    errors.push('advertiserCategory is not one of the allowed values');
  }

  v.policyReviewedBy = str(input.policyReviewedBy);
  if (v.policyReviewedBy && v.policyReviewedBy.length > 160) {
    errors.push('policyReviewedBy must be 160 characters or fewer');
  }

  v.vaAccreditationNumber = str(input.vaAccreditationNumber);
  v.notes = str(input.notes).slice(0, 500);

  const dd = input.dueDiligence && typeof input.dueDiligence === 'object' ? input.dueDiligence : {};
  v.dueDiligence = {
    contactName: str(dd.contactName).slice(0, 120),
    linkedin: str(dd.linkedin),
    facebook: str(dd.facebook),
    businessWebsite: str(dd.businessWebsite),
    interviewedBy: str(dd.interviewedBy).slice(0, 120),
    interviewedOn: str(dd.interviewedOn),
    accreditationVerifiedOn: str(dd.accreditationVerifiedOn),
    notes: str(dd.notes).slice(0, 1000),
  };
  for (const field of ['linkedin', 'facebook', 'businessWebsite']) {
    if (v.dueDiligence[field]) {
      const e = badUrl(v.dueDiligence[field], `dueDiligence.${field}`);
      if (e) errors.push(e);
    }
  }
  for (const field of ['interviewedOn', 'accreditationVerifiedOn']) {
    if (v.dueDiligence[field] && !DATE.test(v.dueDiligence[field])) {
      errors.push(`dueDiligence.${field} must be YYYY-MM-DD`);
    }
  }

  return { errors, value: v };
}

/**
 * The checks that must pass before an ad may be approved to run.
 *
 * Separate from validateSponsor because a draft is allowed to be incomplete.
 * These are the ones with a Veteran on the other end of them, so they are
 * enforced at the moment of approval and again by the site's own build tests.
 *
 * The accreditation rule is federal law, not a house preference: under
 * 38 U.S.C. 5904 only a VA-accredited attorney or claims agent may charge a
 * Veteran a fee, and only for work after VA has decided the initial claim. An
 * advertiser in that category who cannot produce a number is selling something
 * they are not permitted to sell.
 */
export function approvalBlockers(sponsor) {
  const blockers = [];
  if (!sponsor.policyReviewedBy) {
    blockers.push('No policy sign-off. Name the person who read docs/ADVERTISING.md against this advertiser.');
  }
  if (sponsor.image && !sponsor.image.startsWith('/sponsors/')) {
    blockers.push('Creative is not self-hosted.');
  }
  if (sponsor.advertiserCategory === 'claims-representation') {
    if (!sponsor.vaAccreditationNumber) {
      blockers.push('Claims representation with no VA accreditation number. This advertiser may not lawfully charge a Veteran.');
    }
    if (!sponsor.dueDiligence?.accreditationVerifiedOn) {
      blockers.push('Accreditation number has not been verified against the VA OGC accreditation search.');
    }
    if (!sponsor.dueDiligence?.interviewedOn) {
      blockers.push('No recorded interview. The advertising policy requires one for claims representation.');
    }
  }
  if (sponsor.advertiserCategory === 'legal-other' && !sponsor.dueDiligence?.contactName) {
    blockers.push('Legal advertiser with no due-diligence contact recorded.');
  }
  return blockers;
}
