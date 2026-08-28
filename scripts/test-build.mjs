/**
 * Build smoke tests. These run in CI before every deploy.
 *
 * The point is not to test that HTML renders. It is to catch the specific ways
 * this particular site could hurt someone: a missing crisis line, a page that
 * lost its source attribution, or scraped content escaping into markup.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../pipeline/core/registry.mjs';

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
check('CNAME ships so the custom domain survives deploys', existsSync('dist/CNAME') && read('CNAME').trim() === 'usvethub.com');

// 6. Fixture data must never reach the public site.
const fixtureLeak = pageFiles.filter((f) => readFileSync(f, 'utf8').includes('zz-test-'));
check('no test fixture data reached the site', fixtureLeak.length === 0, fixtureLeak.join(', '));

console.log(`\n${failures === 0 ? 'All build tests passed.' : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
