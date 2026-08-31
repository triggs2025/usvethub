/**
 * The management view. What is covered, what is sold, and what needs attention.
 *
 *   npm run status              summary in the terminal
 *   npm run status -- --full    every jurisdiction, not just the ones needing work
 *   npm run status -- --html    also write admin/dashboard.html and print the path
 *
 * Why this exists: 56 jurisdictions times 15 categories is 840 cells, plus an
 * advertiser book on top. Nobody can hold that in their head, and the failure
 * mode is not knowing which of those cells is empty. Everything here is read
 * from the same published data the site is built from, so it cannot drift.
 *
 * It writes nothing into dist/, so none of this is ever published. Inventory
 * you have not sold yet is not the public's business.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadAll, daysSince, isStale, today, STALE_AFTER_DAYS, CATEGORIES, CATEGORY_LABELS,
} from '../src/lib/data.mjs';
import { SLOTS, SLOT_LABELS, MAX_ADS_PER_SLOT, eligibleSponsors } from '../src/lib/sponsors.mjs';
import { esc } from '../src/lib/html.mjs';

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const WRITE_HTML = args.includes('--html');

/** Renewal warning window. A month is enough notice to have the conversation. */
const RENEWAL_WARNING_DAYS = 30;

const TODAY = today();
const site = loadAll();
const { jurisdictions, benefits, allSponsors, discounts, organizations } = site;

// ------------------------------------------------------------------ coverage

const CATEGORY_COUNT = CATEGORIES.length;

const coverage = jurisdictions.map((j) => {
  const own = benefits.filter((b) => b.jurisdiction === j.code);
  const verified = own.filter((b) => b.confidence === 'verified');
  const stale = own.filter(isStale);
  const filled = new Set(own.map((b) => b.category));
  const orgs = organizations.filter((o) => o.jurisdiction === j.code);
  const localDiscounts = discounts.filter((d) => d.jurisdiction === j.code);

  // What a reader in this jurisdiction would actually see in the ad slot.
  const ads = eligibleSponsors(site.sponsors, 'jurisdiction', j.code);

  return {
    code: j.code,
    name: j.name,
    type: j.type,
    benefits: own.length,
    verified: verified.length,
    drafts: own.length - verified.length,
    stale: stale.length,
    categories: filled.size,
    missingCategories: CATEGORIES.filter((c) => !filled.has(c.key)).map((c) => c.key),
    organizations: orgs.length,
    discounts: localDiscounts.length,
    ads: ads.length,
    adsTargeted: ads.filter((s) => s.jurisdictions && s.jurisdictions.length > 0).length,
  };
});

const totals = {
  benefits: benefits.length,
  verified: benefits.filter((b) => b.confidence === 'verified').length,
  stale: benefits.filter(isStale).length,
  covered: coverage.filter((c) => c.benefits > 0).length,
  empty: coverage.filter((c) => c.benefits === 0),
};

const backlog = CATEGORIES
  .map((c) => ({
    key: c.key,
    label: c.label,
    drafts: benefits.filter((b) => b.category === c.key && b.confidence !== 'verified').length,
    verified: benefits.filter((b) => b.category === c.key && b.confidence === 'verified').length,
  }))
  .filter((c) => c.drafts > 0)
  .sort((a, b) => b.drafts - a.drafts);

// -------------------------------------------------------------- advertisers

const flightState = (s) => {
  if (s.startsAt > TODAY) return 'scheduled';
  if (s.endsAt < TODAY) return 'ended';
  return 'live';
};

const book = allSponsors
  .map((s) => ({
    ...s,
    state: flightState(s),
    daysLeft: -daysSince(s.endsAt),
    reach: !s.jurisdictions || s.jurisdictions.length === 0
      ? 'National, all 56'
      : s.jurisdictions.join(', '),
  }))
  .sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.id.localeCompare(b.id));

const live = book.filter((s) => s.state === 'live');
const scheduled = book.filter((s) => s.state === 'scheduled');
const ended = book.filter((s) => s.state === 'ended');
const expiringSoon = live.filter((s) => s.daysLeft <= RENEWAL_WARNING_DAYS);

/**
 * Inventory, counted the way you would sell it.
 *
 * The jurisdiction slot is not one placement, it is 56 of them, and a national
 * buy fills all 56 at once. Counting it as a single slot would hide the fact
 * that a state page can still be sold to a state advertiser alongside it.
 */
const inventory = SLOTS.map((slot) => {
  if (slot === 'jurisdiction') {
    const pagesWithAny = coverage.filter((c) => c.ads > 0).length;
    const pagesAtCapacity = coverage.filter((c) => c.ads >= MAX_ADS_PER_SLOT).length;
    return {
      slot,
      label: SLOT_LABELS[slot],
      positions: jurisdictions.length * MAX_ADS_PER_SLOT,
      filled: coverage.reduce((sum, c) => sum + Math.min(c.ads, MAX_ADS_PER_SLOT), 0),
      note: `${pagesWithAny} of ${jurisdictions.length} pages carry an ad, ${pagesAtCapacity} ${pagesAtCapacity === 1 ? 'is' : 'are'} full`,
    };
  }
  const n = eligibleSponsors(site.sponsors, slot).length;
  return {
    slot,
    label: SLOT_LABELS[slot],
    positions: MAX_ADS_PER_SLOT,
    filled: Math.min(n, MAX_ADS_PER_SLOT),
    note: n > MAX_ADS_PER_SLOT ? `${n - MAX_ADS_PER_SLOT} sold but not rendering, over the cap` : '',
  };
});

/**
 * Things that should stop a sale, or stop a deploy.
 *
 * The claims-representation checks are the important ones. Federal law lets
 * only a VA-accredited attorney or claims agent charge a Veteran, and only
 * after VA has decided the initial claim. An ad in that category without a
 * verified accreditation number is the exact harm this site exists to warn
 * Veterans about, so it is flagged loudly rather than listed quietly.
 */
const problems = [];
for (const s of book) {
  if (s.state === 'ended') continue;
  const where = `${s.id} (${s.advertiser})`;
  if (!s.policyReviewedBy) {
    problems.push(`${where}: no policyReviewedBy. No ad runs without a named human sign-off.`);
  }
  if (s.image && !s.image.startsWith('/sponsors/')) {
    problems.push(`${where}: creative is not self-hosted. Download it into public/sponsors/ instead.`);
  }
  if (s.image && !s.imageAlt) {
    problems.push(`${where}: creative has no imageAlt.`);
  }
  if (s.advertiserCategory === 'claims-representation') {
    if (!s.vaAccreditationNumber) {
      problems.push(`${where}: CLAIMS REPRESENTATION with no VA accreditation number. Do not run this.`);
    }
    if (!s.dueDiligence?.accreditationVerifiedOn) {
      problems.push(`${where}: claims representation, accreditation never verified against the VA OGC search.`);
    }
    if (!s.dueDiligence?.interviewedOn) {
      problems.push(`${where}: claims representation, no recorded interview. The policy requires one.`);
    }
  }
  if (s.advertiserCategory === 'legal-other' && !s.dueDiligence?.contactName) {
    problems.push(`${where}: legal advertiser with no due-diligence contact recorded.`);
  }
  if (s.endsAt < s.startsAt) {
    problems.push(`${where}: flight ends before it starts.`);
  }
  const targets = s.jurisdictions ?? [];
  const unknown = targets.filter((code) => !jurisdictions.some((j) => j.code === code));
  if (unknown.length) {
    problems.push(`${where}: targets unknown jurisdiction ${unknown.join(', ')}.`);
  }
  if (s.slot !== 'jurisdiction' && targets.length) {
    problems.push(`${where}: jurisdictions are only used by the jurisdiction slot, so this targeting does nothing.`);
  }
}

// -------------------------------------------------------------------- output

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));
const bar = (n, d, width = 18) => {
  const filled = d === 0 ? 0 : Math.round((n / d) * width);
  return '#'.repeat(filled) + '.'.repeat(width - filled);
};

const needsWork = coverage
  .filter((c) => c.benefits === 0 || c.drafts > 0 || c.stale > 0)
  .sort((a, b) => a.benefits - b.benefits || b.drafts - a.drafts);

const shown = FULL ? [...coverage].sort((a, b) => a.name.localeCompare(b.name)) : needsWork;

console.log('');
console.log('USVetHub status                                            ' + TODAY);
console.log('='.repeat(72));
console.log('');
console.log('CONTENT');
console.log(`  ${totals.benefits} benefit records across ${totals.covered} of ${jurisdictions.length} jurisdictions`);
console.log(`  ${totals.verified} verified, ${totals.benefits - totals.verified} still drafts   ${bar(totals.verified, totals.benefits)}  ${pct(totals.verified, totals.benefits)}%`);
if (totals.stale > 0) {
  console.log(`  ${totals.stale} records last checked over ${STALE_AFTER_DAYS} days ago`);
}
console.log(`  ${organizations.length} organizations, ${discounts.length} live discounts`);
if (totals.empty.length) {
  console.log(`  ${totals.empty.length} jurisdictions with no benefits at all: ${totals.empty.map((c) => c.code).join(' ')}`);
}
console.log('');

console.log('ADVERTISERS');
console.log(`  ${live.length} live, ${scheduled.length} scheduled, ${ended.length} ended`);
for (const inv of inventory) {
  const label = inv.label.padEnd(28);
  console.log(`  ${label} ${String(inv.filled).padStart(3)} / ${String(inv.positions).padEnd(4)} ${bar(inv.filled, inv.positions)}${inv.note ? '  ' + inv.note : ''}`);
}
if (expiringSoon.length) {
  console.log('');
  console.log(`  RENEWALS DUE within ${RENEWAL_WARNING_DAYS} days:`);
  for (const s of expiringSoon) {
    console.log(`    ${s.endsAt}  ${String(s.daysLeft).padStart(3)}d  ${s.advertiser} (${s.slot}, ${s.reach})`);
  }
}
if (scheduled.length) {
  console.log('');
  console.log('  BOOKED, not yet running:');
  for (const s of scheduled) {
    console.log(`    ${s.startsAt}  ${s.advertiser} (${s.slot}, ${s.reach})`);
  }
}
console.log('');

if (problems.length) {
  console.log('PROBLEMS THAT BLOCK A SALE');
  for (const p of problems) console.log(`  ! ${p}`);
  console.log('');
}

if (backlog.length) {
  console.log('VERIFICATION BACKLOG, worst first');
  for (const c of backlog) {
    console.log(`  ${c.label.padEnd(30)} ${String(c.drafts).padStart(3)} draft, ${String(c.verified).padStart(3)} verified`);
  }
  console.log('');
}

console.log(FULL ? 'EVERY JURISDICTION' : 'JURISDICTIONS NEEDING WORK   (--full for all 56)');
console.log('  code  name                      recs  ver  draft  stale  cats  orgs  ads');
for (const c of shown) {
  console.log(
    `  ${c.code.padEnd(5)} ${c.name.slice(0, 24).padEnd(25)} ${String(c.benefits).padStart(4)} `
    + `${String(c.verified).padStart(4)} ${String(c.drafts).padStart(6)} ${String(c.stale).padStart(6)} `
    + `${String(c.categories).padStart(3)}/${CATEGORY_COUNT} ${String(c.organizations).padStart(5)} ${String(c.ads).padStart(4)}`,
  );
}
console.log('');

if (site.loadIssues.length) {
  console.log('FILES SKIPPED AT LOAD');
  for (const i of site.loadIssues) console.log(`  ! ${i}`);
  console.log('');
}

// ------------------------------------------------------------------ dashboard

if (WRITE_HTML) {
  const rows = [...coverage].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const missing = c.missingCategories.map((k) => CATEGORY_LABELS[k] ?? k).join(', ');
    return `<tr data-row data-search="${esc(`${c.code} ${c.name} ${c.type}`.toLowerCase())}"
      data-state="${c.benefits === 0 ? 'empty' : c.drafts > 0 ? 'drafts' : 'done'}"
      data-ads="${c.ads > 0 ? 'sold' : 'unsold'}">
      <td><code>${esc(c.code)}</code></td>
      <td>${esc(c.name)}</td>
      <td class="n">${c.benefits}</td>
      <td class="n">${c.verified}</td>
      <td class="n${c.drafts ? ' warn' : ''}">${c.drafts}</td>
      <td class="n${c.stale ? ' warn' : ''}">${c.stale}</td>
      <td class="n">${c.categories}/${CATEGORY_COUNT}</td>
      <td class="n">${c.organizations}</td>
      <td class="n${c.ads ? ' good' : ''}">${c.ads}</td>
      <td class="missing">${esc(missing)}</td>
    </tr>`;
  }).join('\n');

  const bookRows = book.length
    ? book.map((s) => `<tr class="state-${esc(s.state)}">
        <td>${esc(s.advertiser)}</td>
        <td>${esc(s.slot)}</td>
        <td>${esc(s.reach)}</td>
        <td>${esc(s.startsAt)}</td>
        <td>${esc(s.endsAt)}</td>
        <td>${esc(s.state)}${s.state === 'live' && s.daysLeft <= RENEWAL_WARNING_DAYS ? ` · ${s.daysLeft}d left` : ''}</td>
        <td>${esc(s.policyReviewedBy ?? '')}</td>
      </tr>`).join('\n')
    : '<tr><td colspan="7" class="muted">No sponsor records yet. Copy data/curated/sponsors/_template.json to start one.</td></tr>';

  const html = `<!doctype html>
<meta charset="utf-8">
<title>USVetHub status ${TODAY}</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root { color-scheme: light dark; --line:#8883; --warn:#b45309; --good:#15803d; --bad:#b91c1c; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 2rem 1.25rem 4rem; max-width: 1100px; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; }
  .muted { opacity: .65; }
  .cards { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: .6rem .9rem; min-width: 8.5rem; }
  .card b { display: block; font-size: 1.5rem; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--line); }
  th { position: sticky; top: 0; background: Canvas; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.warn { color: var(--warn); font-weight: 600; }
  td.good { color: var(--good); font-weight: 600; }
  td.missing { font-size: .78rem; opacity: .7; }
  .controls { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: .75rem 0; }
  input[type=search] { padding: .45rem .6rem; border: 1px solid var(--line); border-radius: 6px; min-width: 15rem; font: inherit; }
  button { padding: .4rem .7rem; border: 1px solid var(--line); border-radius: 999px; background: transparent; font: inherit; cursor: pointer; }
  button[aria-pressed=true] { background: CanvasText; color: Canvas; }
  .problem { color: var(--bad); }
  tr.state-ended { opacity: .5; }
  ul { margin: .25rem 0; padding-left: 1.1rem; }
</style>
<h1>USVetHub status</h1>
<p class="muted">Generated ${TODAY} by <code>npm run status -- --html</code>. Local file, never deployed. Regenerate it, do not edit it.</p>

<div class="cards">
  <div class="card"><b>${totals.benefits}</b>benefit records</div>
  <div class="card"><b>${pct(totals.verified, totals.benefits)}%</b>verified</div>
  <div class="card"><b>${totals.covered}/${jurisdictions.length}</b>jurisdictions covered</div>
  <div class="card"><b>${live.length}</b>ads live</div>
  <div class="card"><b>${expiringSoon.length}</b>renewals due</div>
  <div class="card"><b>${problems.length}</b>blocking problems</div>
</div>

${problems.length ? `<h2 class="problem">Problems that block a sale</h2><ul class="problem">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}

<h2>Advertiser inventory</h2>
<table>
  <thead><tr><th>Slot</th><th>Filled</th><th>Positions</th><th>Notes</th></tr></thead>
  <tbody>${inventory.map((i) => `<tr><td>${esc(i.label)}</td><td class="n">${i.filled}</td><td class="n">${i.positions}</td><td class="muted">${esc(i.note)}</td></tr>`).join('')}</tbody>
</table>

<h2>The book</h2>
<table>
  <thead><tr><th>Advertiser</th><th>Slot</th><th>Reach</th><th>Starts</th><th>Ends</th><th>State</th><th>Policy sign-off</th></tr></thead>
  <tbody>${bookRows}</tbody>
</table>

<h2>Coverage by jurisdiction</h2>
<div class="controls">
  <input type="search" id="q" placeholder="Filter by name or code" aria-label="Filter jurisdictions">
  <button type="button" data-f="empty" aria-pressed="false">No benefits</button>
  <button type="button" data-f="drafts" aria-pressed="false">Has drafts</button>
  <button type="button" data-f="done" aria-pressed="false">Fully verified</button>
  <button type="button" data-f="unsold" aria-pressed="false">No ad sold</button>
  <span class="muted" id="count"></span>
</div>
<table>
  <thead><tr><th>Code</th><th>Jurisdiction</th><th>Recs</th><th>Ver</th><th>Draft</th><th>Stale</th><th>Cats</th><th>Orgs</th><th>Ads</th><th>Missing categories</th></tr></thead>
  <tbody id="rows">${rows}</tbody>
</table>

<script>
(function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-row]'));
  var q = document.getElementById('q');
  var count = document.getElementById('count');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button[data-f]'));
  var active = '';

  function apply() {
    var term = (q.value || '').toLowerCase().trim();
    var shown = 0;
    rows.forEach(function (row) {
      var matchesText = !term || row.getAttribute('data-search').indexOf(term) !== -1;
      var matchesFilter = !active
        || row.getAttribute('data-state') === active
        || row.getAttribute('data-ads') === active;
      var visible = matchesText && matchesFilter;
      row.hidden = !visible;
      if (visible) shown++;
    });
    count.textContent = shown + ' of ' + rows.length + ' showing';
  }

  q.addEventListener('input', apply);
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      active = active === b.getAttribute('data-f') ? '' : b.getAttribute('data-f');
      buttons.forEach(function (o) {
        o.setAttribute('aria-pressed', String(o.getAttribute('data-f') === active));
      });
      apply();
    });
  });
  apply();
})();
</script>
`;

  mkdirSync('admin', { recursive: true });
  const out = join('admin', 'dashboard.html');
  writeFileSync(out, html);
  console.log(`Dashboard written to ${out}`);
  console.log('');
}

// A blocking problem should fail a CI run, because an unvetted claims-help ad
// reaching a Veteran is worse than a red build.
if (problems.length && args.includes('--strict')) process.exitCode = 1;
