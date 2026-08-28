/**
 * Generates data/jurisdictions.json: the 56 places USVetHub covers.
 *
 * 50 states, the District of Columbia, and the 5 inhabited US territories.
 * Territories are first-class here, not a footnote. Veterans in Guam, American
 * Samoa, and the Northern Marianas serve at some of the highest per-capita
 * rates in the country and are routinely left off "all 50 states" resources.
 *
 * The state Veteran agency URL is deliberately left null. It gets filled in by
 * hand, one jurisdiction at a time, because a wrong link on a state landing
 * page is worse than no link. Run `npm run curate:status` to see what is left.
 */
import { writeFileSync } from 'node:fs';

const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

const DISTRICT = [['DC', 'District of Columbia']];

const TERRITORIES = [
  ['PR', 'Puerto Rico'],
  ['GU', 'Guam'],
  ['VI', 'US Virgin Islands'],
  ['AS', 'American Samoa'],
  ['MP', 'Northern Mariana Islands'],
];

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const build = (pairs, type) =>
  pairs.map(([code, name]) => ({
    code,
    name,
    type,
    slug: slugify(name),
    veteransAgency: null, // { name, url } once a human has confirmed it
    curation: { benefitsReviewed: false, orgsReviewed: false, notes: null },
  }));

const jurisdictions = [
  ...build(STATES, 'state'),
  ...build(DISTRICT, 'district'),
  ...build(TERRITORIES, 'territory'),
].sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  'data/jurisdictions.json',
  `${JSON.stringify({ generatedBy: 'scripts/build-jurisdictions.mjs', count: jurisdictions.length, jurisdictions }, null, 2)}\n`,
);

console.log(`Wrote ${jurisdictions.length} jurisdictions to data/jurisdictions.json`);
