/**
 * The export contract.
 *
 * The admin Worker and the public pipeline are deliberately separate systems,
 * which means nothing stops them drifting apart except a test that holds them
 * together. This one takes what the Worker would hand you to commit and runs it
 * through the very same validator the scrape uses, against the very same
 * schema file. If the Worker starts producing something the site would reject,
 * this fails here rather than at 11pm during a deploy.
 *
 *   node backend/test-export.mjs
 */
import { validate } from '../pipeline/core/validate.mjs';
import { readJson } from '../pipeline/core/registry.mjs';
import { toPublishedRecord } from './src/index.mjs';
import { validateSponsor, approvalBlockers } from './src/validate.mjs';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n      ${detail}` : ''}`);
};

console.log('Admin export contract\n');
const schema = readJson('data/schema/sponsor.schema.json');

const national = {
  id: 'acme-retail-2026-q4',
  advertiser: 'Acme Retail',
  slot: 'discounts',
  jurisdictions: [],
  headline: 'Ten percent off for Veterans, every day',
  body: 'Show a valid ID in store or use the code online.',
  ctaLabel: 'See the offer',
  destinationUrl: 'https://example.com/veterans',
  image: '/sponsors/acme.png',
  imageAlt: 'Acme Retail logo',
  startsAt: '2026-10-01',
  endsAt: '2026-12-31',
  advertiserCategory: 'retail',
  policyReviewedBy: 'Tony Triggs, 2026-09-15',
  notes: 'Rate agreed at the quarterly price. Renews in January.',
  dueDiligence: { contactName: 'Jane Doe' },
};

const claims = {
  ...national,
  id: 'acme-legal-2026-q4',
  advertiser: 'Acme Legal, PLLC',
  slot: 'jurisdiction',
  jurisdictions: ['AZ', 'NV'],
  advertiserCategory: 'claims-representation',
  vaAccreditationNumber: '12345',
  dueDiligence: {
    contactName: 'Jane Doe',
    interviewedBy: 'Tony Triggs',
    interviewedOn: '2026-09-12',
    accreditationVerifiedOn: '2026-09-15',
    businessWebsite: 'https://example.com',
  },
};

for (const [label, sponsor] of [['national buy', national], ['state-targeted claims advertiser', claims]]) {
  const record = toPublishedRecord(sponsor);
  const errors = validate(record, schema);
  check(`export of a ${label} passes the published sponsor schema`, errors.length === 0, errors.join('; '));
}

// Internal workflow detail must not cross the boundary into a public repo.
const exported = toPublishedRecord(national);
check(
  'export drops internal fields',
  !('notes' in exported) && !('status' in exported) && !('approvedBy' in exported),
  Object.keys(exported).join(', '),
);
check('a national buy exports with no jurisdictions key at all', !('jurisdictions' in exported));
check('a targeted buy keeps its jurisdictions', toPublishedRecord(claims).jurisdictions.join() === 'AZ,NV');

// The approval gate is the one with a Veteran on the other end of it.
check(
  'a claims advertiser with no accreditation number cannot be approved',
  approvalBlockers({ ...claims, vaAccreditationNumber: '' }).length > 0,
);
check(
  'a claims advertiser whose accreditation was never verified cannot be approved',
  approvalBlockers({ ...claims, dueDiligence: { ...claims.dueDiligence, accreditationVerifiedOn: '' } }).length > 0,
);
check('a fully vetted claims advertiser can be approved', approvalBlockers(claims).length === 0,
  approvalBlockers(claims).join('; '));
check('no sponsor can be approved without a named policy sign-off',
  approvalBlockers({ ...national, policyReviewedBy: '' }).length > 0);

// Input validation refuses the things that would hurt.
const bad = [
  ['a javascript: destination', { ...national, destinationUrl: 'javascript:alert(1)' }],
  ['a plain http destination', { ...national, destinationUrl: 'http://example.com' }],
  ['a hotlinked creative', { ...national, image: 'https://advertiser.example.com/ad.png' }],
  ['an image with no alt text', { ...national, imageAlt: '' }],
  ['a flight that ends before it starts', { ...national, startsAt: '2026-12-31', endsAt: '2026-10-01' }],
  ['an unknown jurisdiction code', { ...claims, jurisdictions: ['ZZ'] }],
  ['targeting on a slot that ignores it', { ...national, slot: 'discounts', jurisdictions: ['AZ'] }],
];
for (const [label, input] of bad) {
  check(`validation refuses ${label}`, validateSponsor(input).errors.length > 0);
}
check('validation accepts a well-formed sponsor', validateSponsor(claims).errors.length === 0,
  validateSponsor(claims).errors.join('; '));

console.log(`\n${failures === 0 ? 'Export contract holds.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
