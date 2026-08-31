/**
 * Build smoke tests. These run in CI before every deploy.
 *
 * The point is not to test that HTML renders. It is to catch the specific ways
 * this particular site could hurt someone: a missing crisis line, a page that
 * lost its source attribution, or scraped content escaping into markup.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../pipeline/core/registry.mjs';
import { eligibleSponsors, placedSponsors, SLOTS, MAX_ADS_PER_SLOT } from '../src/lib/sponsors.mjs';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n      ${detail}` : ''}`);
};

console.log('Build tests\n');

execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'pipe' });

const read = (path) => readFileSync(join('dist', path), 'utf8');
const { jurisdictions } = readJson('data/jurisdictions.json');

// 1. Every jurisdiction gets a page, including the territories. A Veteran in
//    American Samoa should never hit a 404 on their own state page.
const missing = jurisdictions.filter((j) => !existsSync(join('dist', j.slug, 'index.html')));
check(`all ${jurisdictions.length} jurisdictions have a page`, missing.length === 0,
  missing.map((j) => j.name).join(', '));

// 2. The crisis line appears on every single page. This is the one piece of
//    information on the site that someone might need in the next five minutes.
const pageFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name));
    else if (entry.name.endsWith('.html')) pageFiles.push(join(dir, entry.name));
  }
})('dist');

const noCrisis = pageFiles.filter((f) => !readFileSync(f, 'utf8').includes('tel:988'));
check(`crisis line is on all ${pageFiles.length} pages`, noCrisis.length === 0,
  noCrisis.slice(0, 5).join(', '));

// 3. No page carries an executable or unresolved link. escUrl() turns anything
//    it does not trust into '#', so a match here means something bypassed it.
const dangerous = pageFiles.filter((f) => /href="\s*(javascript|data|vbscript):/i.test(readFileSync(f, 'utf8')));
check('no page contains a script-bearing href', dangerous.length === 0, dangerous.join(', '));

// 4. Every published record is attributed. An unsourced claim about a benefit
//    is exactly what this site exists not to be.
const home = read('index.html');
check('homepage renders', home.includes('Every Veteran benefit'));
check('homepage states the never-pay warning', home.includes('Never pay for help with a VA claim'));

const az = read(join('arizona', 'index.html'));
check('a populated state page shows its source and check date', /class="source"/.test(az) && /checked \d{4}-\d{2}-\d{2}/.test(az));

// 5. Search engines and the correction path both depend on these.
check('sitemap.xml exists and lists pages', existsSync('dist/sitemap.xml') && read('sitemap.xml').includes('<loc>'));
check('robots.txt exists', existsSync('dist/robots.txt'));
check('404 page exists', existsSync('dist/404.html'));
// CNAME must ship for a production-domain build and must NOT ship for a
// subpath build, or Pages claims a domain whose DNS is not ready.
const prodBuild = !process.env.SITE_BASE_URL || new URL(process.env.SITE_BASE_URL).pathname.replace(/\/+$/, '') === '';
check(
  prodBuild ? 'CNAME ships for a production-domain build' : 'CNAME is withheld from a subpath build',
  prodBuild ? existsSync('dist/CNAME') && read('CNAME').trim() === 'usvethub.com' : !existsSync('dist/CNAME'),
);

// Every internal link must carry the deploy base, or the whole site 404s when
// served from a subpath. This is the bug that shipped a stylesheet-less site.
const baseExpected = prodBuild ? '' : new URL(process.env.SITE_BASE_URL).pathname.replace(/\/+$/, '');
const homeHtml = read('index.html');
const cssHref = (homeHtml.match(/href="([^"]*styles\.[0-9a-f]{8}\.css)"/) || [])[1];
check(
  `stylesheet is fingerprinted and carries the deploy base "${baseExpected || '(root)'}"`,
  Boolean(cssHref) && cssHref.startsWith(`${baseExpected}/styles.`),
  cssHref ?? 'no fingerprinted stylesheet found',
);
// An unhashed copy left in dist would be a URL that is allowed to go stale,
// which is the entire failure this mechanism exists to prevent.
check(
  'no unhashed styles.css or app.js is published',
  !existsSync('dist/styles.css') && !existsSync('dist/app.js'),
);
check(
  'state links carry the deploy base',
  homeHtml.includes(`href="${baseExpected}/arizona/"`),
);

// The CSP is the guard that makes every future third-party script deliberate.
check('every page carries a Content-Security-Policy', pageFiles.every((f) => readFileSync(f, 'utf8').includes("default-src 'none'")));

// Hero video band.
const heroVideos = [...homeHtml.matchAll(/<source src="([^"]+)"/g)].map((m) => m[1]);
check('hero band has three videos', heroVideos.length === 3, heroVideos.join(', '));
check(
  'every hero video is self-hosted, never a third party',
  heroVideos.every((src) => src.startsWith(`${baseExpected}/video/`)),
  'a remote video URL would be blocked by media-src and would leak visitors to another host',
);
check('CSP allows media from our own origin', homeHtml.includes("media-src 'self'"));
check(
  'each hero video has a poster, so something paints before the video loads',
  (homeHtml.match(/<video[^>]+poster="/g) || []).length === 3,
);
check(
  'reduced-motion still image is rendered for every clip',
  (homeHtml.match(/class="hero-still"/g) || []).length === 3,
);

// Video is the fastest way to blow through Pages' bandwidth allowance and to
// wreck Core Web Vitals, which the ad business depends on. Budget it explicitly
// rather than discovering the problem from a GitHub warning email.
const VIDEO_BUDGET_MB = 12;
let videoBytes = 0;
for (const file of existsSync('dist/video') ? readdirSync('dist/video') : []) {
  if (/\.(mp4|webm|mov)$/i.test(file)) videoBytes += statSync(join('dist/video', file)).size;
}
const videoMB = videoBytes / 1048576;
check(
  `hero video weight is within the ${VIDEO_BUDGET_MB} MB budget`,
  videoMB <= VIDEO_BUDGET_MB,
  `currently ${videoMB.toFixed(2)} MB. Compress, shorten, or move to a CDN before raising this.`,
);

// Interactivity is progressive enhancement, so the filter controls must ship
// hidden. If they ever render visible server-side, a visitor without JS gets a
// search box that silently does nothing.
check(
  'filter controls ship hidden and are revealed only by app.js',
  homeHtml.includes('class="filter" data-filter') && !homeHtml.includes('class="filter is-ready"'),
);
check(
  'app.js is fingerprinted and served from our own origin',
  new RegExp(`src="${baseExpected}/app\.[0-9a-f]{8}\.js"`).test(homeHtml),
);
check('CSP allows first-party script and nothing else', homeHtml.includes("script-src 'self'"));
check(
  'no inline event handlers anywhere, which the CSP would refuse',
  !pageFiles.some((f) => / on(click|load|error|mouseover)=/i.test(readFileSync(f, 'utf8'))),
);
check(
  'the full state list is present in the HTML, not built by script',
  (homeHtml.match(/data-filter-item/g) || []).length === jurisdictions.length,
);

// Release paperwork is administrative and must never be published. The field
// in hero.json is a pointer for our own records; if it ever starts rendering,
// that is a privacy leak on a public repo, so fail the build instead.
const heroConfig = JSON.parse(readFileSync('data/curated/hero.json', 'utf8'));
const releaseNotes = heroConfig.videos.map((v) => v.release).filter(Boolean);
check(
  'release notes never reach the published HTML',
  !releaseNotes.some((note) => pageFiles.some((f) => readFileSync(f, 'utf8').includes(note))),
  'hero.json release fields are internal record-keeping, not page content',
);

// 6. Fixture data must never reach the public site.
const fixtureLeak = pageFiles.filter((f) => readFileSync(f, 'utf8').includes('zz-test-'));
check('no test fixture data reached the site', fixtureLeak.length === 0, fixtureLeak.join(', '));

// 7. Search. The index is generated, so the failure mode is silent: it keeps
//    building and quietly stops containing anything.
const searchPage = read(join('search', 'index.html'));
check('search page exists and ships its input hidden', searchPage.includes('data-search-page') && /data-search-page hidden/.test(searchPage));
check(
  'search page lists browse links, so it is useful without JavaScript',
  searchPage.includes('data-search-fallback') && searchPage.includes('/organizations/'),
);
check('CSP allows the index fetch and nothing else', homeHtml.includes("connect-src 'self'"));

const indexPath = join('dist', 'search-index.json');
check('search index is generated', existsSync(indexPath));
if (existsSync(indexPath)) {
  const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
  const benefitCount = readdirSync(join('data', 'published', 'benefits'))
    .filter((f) => f.endsWith('.json'))
    .reduce((n, f) => n + (readJson(join('data', 'published', 'benefits', f)).records ?? []).length, 0);
  check(
    'search index covers every jurisdiction and every benefit',
    idx.length >= jurisdictions.length + benefitCount,
    `${idx.length} entries for ${jurisdictions.length} jurisdictions + ${benefitCount} benefits`,
  );
  check('every search entry has a title and a destination', idx.every((e) => e.t && e.u));
  check(
    'search index carries no unpublished or draft-only field',
    !idx.some((e) => 'confidence' in e || 'notes' in e),
  );
  // The 11,800 nonprofits would turn an 80 KB file into something megabytes
  // wide, which is a search box nobody waits for.
  const kb = statSync(indexPath).size / 1024;
  check(`search index is under 400 KB`, kb < 400, `currently ${kb.toFixed(0)} KB`);
}

// 8. Advertising. These are the rules from docs/ADVERTISING.md, enforced rather
//    than trusted, because the money is the thing most likely to bend them.

// Placement logic, tested on constructed records so it holds whether or not
// anything is currently sold. A slot that only works once you have an
// advertiser is a slot you find out is broken on the day you take money.
const NATIONAL = { id: 'zz-national', slot: 'jurisdiction', advertiser: 'N' };
const TARGETED = { id: 'zz-targeted', slot: 'jurisdiction', advertiser: 'T', jurisdictions: ['AZ'] };
const OTHER = { id: 'zz-other', slot: 'jurisdiction', advertiser: 'O', jurisdictions: ['TX'] };
const fixture = [NATIONAL, TARGETED, OTHER];

check(
  'a national buy runs on a jurisdiction that no one targeted',
  eligibleSponsors(fixture, 'jurisdiction', 'AL').map((s) => s.id).join() === 'zz-national',
);
check(
  'a jurisdiction-targeted buy outranks a national one on that page',
  eligibleSponsors(fixture, 'jurisdiction', 'AZ').map((s) => s.id).join() === 'zz-targeted,zz-national',
  'someone who paid to reach Arizona must not be pushed off the Arizona page',
);
check(
  "a buy targeted elsewhere does not leak onto another state's page",
  !eligibleSponsors(fixture, 'jurisdiction', 'AZ').some((s) => s.id === 'zz-other'),
);
check(
  'placement is capped, so a slot cannot fill a page with ads',
  placedSponsors([NATIONAL, TARGETED, OTHER, { id: 'zz-4', slot: 'jurisdiction', advertiser: '4' }],
    'jurisdiction', 'AZ').length <= MAX_ADS_PER_SLOT,
);
check(
  'placement is deterministic, so two builds of the same data match',
  JSON.stringify(eligibleSponsors(fixture, 'jurisdiction', 'AZ'))
    === JSON.stringify(eligibleSponsors([...fixture].reverse(), 'jurisdiction', 'AZ')),
);

// Every slot named in the schema is actually rendered somewhere. A slot you can
// sell but never renders is a slot you can accidentally take money for.
const slotPages = {
  jurisdiction: join('dist', 'arizona', 'index.html'),
  discounts: join('dist', 'discounts', 'index.html'),
  organizations: join('dist', 'organizations', 'index.html'),
  'free-help': join('dist', 'free-help', 'index.html'),
};
const sponsorSchema = readJson('data/schema/sponsor.schema.json');
const schemaSlots = sponsorSchema.properties.slot.enum;
check(
  'every sellable slot in the schema has a page that renders it',
  schemaSlots.every((s) => SLOTS.includes(s)) && SLOTS.every((s) => schemaSlots.includes(s)),
  `schema: ${schemaSlots.join(', ')} · rendered: ${SLOTS.join(', ')}`,
);
check(
  'every slot page exists to render into',
  Object.values(slotPages).every((p) => existsSync(p)),
);

// Now the live book, whatever is in it today.
const liveToday = new Date().toISOString().slice(0, 10);
const allSponsorRecords = existsSync(join('data', 'published', 'sponsors'))
  ? readdirSync(join('data', 'published', 'sponsors'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => readJson(join('data', 'published', 'sponsors', f)).records ?? [])
  : [];
const unexpired = allSponsorRecords.filter((s) => s.endsAt >= liveToday);

check(
  'no sponsor creative is hotlinked from the advertiser',
  unexpired.every((s) => !s.image || s.image.startsWith('/sponsors/')),
  'a hotlinked image can be swapped for something else after you approved it',
);
check(
  'every unexpired flight carries a named policy sign-off',
  unexpired.every((s) => typeof s.policyReviewedBy === 'string' && s.policyReviewedBy.length >= 3),
);
check(
  'every claims-representation advertiser has a verified VA accreditation number',
  unexpired
    .filter((s) => s.advertiserCategory === 'claims-representation')
    .every((s) => s.vaAccreditationNumber && s.dueDiligence?.accreditationVerifiedOn),
  'only accredited attorneys and agents may lawfully charge a Veteran, and only after a decision',
);

// And what actually reached the page.
const sponsorPages = pageFiles.filter((f) => readFileSync(f, 'utf8').includes('class="sponsor"'));
check(
  'every rendered ad is labeled Sponsored in text next to the creative',
  sponsorPages.every((f) => {
    const h = readFileSync(f, 'utf8');
    return (h.match(/class="sponsor"/g) || []).length === (h.match(/class="sponsor-flag"/g) || []).length;
  }),
  `${sponsorPages.length} page(s) currently carry an ad`,
);
check(
  'every ad destination is rel="sponsored noopener", so it passes no ranking signal',
  sponsorPages.every((f) => {
    const h = readFileSync(f, 'utf8');
    return (h.match(/class="sponsor"/g) || []).length
      <= (h.match(/rel="sponsored noopener"/g) || []).length;
  }),
);
check(
  'an expired or unstarted flight never reaches a page',
  !allSponsorRecords
    .filter((s) => s.endsAt < liveToday || s.startsAt > liveToday)
    .some((s) => pageFiles.some((f) => readFileSync(f, 'utf8').includes(s.headline))),
);

console.log(`\n${failures === 0 ? 'All build tests passed.' : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
