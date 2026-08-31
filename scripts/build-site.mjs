/**
 * Builds the static site into dist/.
 *
 * Zero dependencies by design. This is a data-to-HTML renderer, which is a
 * problem small enough that a framework would add more supply-chain surface
 * than it removes. See docs/SUGGESTIONS.md entry 22 for when to revisit that.
 *
 *   npm run build
 */
import { mkdirSync, writeFileSync, rmSync, cpSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readJson } from '../pipeline/core/registry.mjs';
import { layout, esc, escUrl, html, SITE, SITE_URL, ASSETS } from '../src/lib/html.mjs';
import { LOGOS, ACTIVE_LOGO } from '../src/lib/logos.mjs';
import { placedSponsors } from '../src/lib/sponsors.mjs';
import { payingForHelpBody, payingForHelpMeta } from '../src/pages/paying-for-help.mjs';
import {
  loadAll, isStale, daysSince, STALE_AFTER_DAYS, ORG_TYPE_LABELS, CATEGORY_LABELS, CATEGORIES,
  DISCOUNT_CATEGORIES, DISCOUNT_CATEGORY_LABELS, DISCOUNT_STALE_AFTER_DAYS, FREE_HELP_ORG_TYPES,
} from '../src/lib/data.mjs';

const OUT = join(process.cwd(), 'dist');
rmSync(OUT, { recursive: true, force: true }); // never ship a stale page from a deleted route
const pages = [];

function page(path, content) {
  pages.push(path);
  const dir = path === '/404.html' ? OUT : join(OUT, path);
  const file = path === '/404.html' ? join(OUT, '404.html') : join(dir, 'index.html');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, content);
}

// Fingerprint the assets before any page renders, since every page embeds
// their names. Eight hex characters is ample: this guards against staleness,
// not against collision attacks.
const fingerprint = (file) =>
  createHash('sha256').update(readFileSync(join('public', file))).digest('hex').slice(0, 8);
const CSS_NAME = `styles.${fingerprint('styles.css')}.css`;
const JS_NAME = `app.${fingerprint('app.js')}.js`;
ASSETS.css = `/${CSS_NAME}`;
ASSETS.js = `/${JS_NAME}`;

const site = loadAll();
const { jurisdictions, byCode, benefits, federal, organizations, nonprofits, discounts, sponsors, health } = site;

// ---------------------------------------------------------------- components

/**
 * Says out loud when a record has not been checked by a person yet.
 *
 * This site's whole claim is that entries are verified against an official
 * source. Research drafts are useful, but showing one with the same confidence
 * as a human-checked record would make that claim false. So the reader is told,
 * on the card, in plain words.
 */
const confidenceNote = (record) =>
  record.confidence === 'verified'
    ? ''
    : html`<p class="unchecked">
        <strong>Draft, not yet checked by a person.</strong>
        Researched from the official source linked below, but nobody here has
        confirmed it line by line yet. Verify with the agency before you rely on it.
      </p>`;

const staleNote = (record) =>
  isStale(record)
    ? html`<p class="stale">Last checked ${esc(record.verifiedAt)}, over ${STALE_AFTER_DAYS} days ago. Confirm with the agency before relying on it.</p>`
    : '';

const sourceLine = (record) => html`<p class="source">
  Source: <a href="${escUrl(record.source?.homepage)}" rel="nofollow noopener">${esc(record.source?.title)}</a>
  · checked ${esc(record.verifiedAt)}
</p>`;

function orgCard(org) {
  const contact = [
    org.website ? html`<a href="${escUrl(org.website)}" rel="noopener">Website</a>` : '',
    org.phone ? html`<a href="tel:${esc(org.phone.replace(/\D/g, ''))}">${esc(org.phone)}</a>` : '',
    org.email ? html`<a href="mailto:${esc(org.email)}">${esc(org.email)}</a>` : '',
  ].filter(Boolean);

  return html`<article class="card">
    <h3>${esc(org.name)}</h3>
    <p class="tag">${esc(ORG_TYPE_LABELS[org.orgType] ?? org.orgType)}${org.city ? html` · ${esc(org.city)}` : ''}</p>
    ${org.description ? html`<p>${esc(org.description)}</p>` : ''}
    ${contact.length ? html`<p class="contact">${contact.join(' · ')}</p>` : ''}
    ${staleNote(org)}
    ${sourceLine(org)}
  </article>`;
}

function benefitCard(benefit) {
  return html`<article class="card">
    <h3>${esc(benefit.title)}</h3>
    <p class="tag">${esc(CATEGORY_LABELS[benefit.category] ?? benefit.category)}</p>
    ${benefit.amount ? html`<p class="amount">${esc(benefit.amount)}</p>` : ''}
    <p>${esc(benefit.summary)}</p>
    ${benefit.eligibility?.length
      ? html`<details><summary>Who qualifies</summary><ul>${benefit.eligibility.map((e) => html`<li>${esc(e)}</li>`)}</ul></details>`
      : ''}
    ${benefit.details?.length
      ? html`<details><summary>What else to know</summary>${benefit.details.map((d) => html`<p>${esc(d)}</p>`)}</details>`
      : ''}
    ${benefit.statuteRef || benefit.agency
      ? html`<p class="admin">${[benefit.agency, benefit.statuteRef].filter(Boolean).map(esc).join(' · ')}</p>`
      : ''}
    <p class="contact">
      <a href="${escUrl(benefit.officialUrl)}" rel="noopener">Official page</a>
      ${benefit.applyUrl ? html` · <a href="${escUrl(benefit.applyUrl)}" rel="noopener">How to apply</a>` : ''}
    </p>
    ${confidenceNote(benefit)}
    ${staleNote(benefit)}
    ${sourceLine(benefit)}
  </article>`;
}

/**
 * Category icons. Inline SVG, because an icon font or a sprite from a CDN
 * would be a third-party request the CSP refuses, and rightly.
 *
 * Deliberately simple geometry: these read at 18px, which is the only size
 * they are ever drawn at.
 */
const ICON_PATHS = {
  employment: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18',
  education: 'M12 4 2 9l10 5 10-5zM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5',
  business: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6M2 20h20',
  health: 'M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20z',
  housing: 'M3 11 12 4l9 7M6 10v10h12V10M10 20v-5h4v5',
  'property-tax': 'M3 11 12 4l9 7M6 10v10h12V10M12 13v4M10.5 14.2h3',
  'income-tax': 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6',
  financial: 'M2 8h20v10H2zM2 12h20M6 15h3',
  vehicle: 'M4 16v-4l2-5h12l2 5v4M4 16h16M6.5 16v2h-2v-2M19.5 16v2h-2v-2M7 12.5h2M15 12.5h2',
  recreation: 'M3 20l6-8 4 5 2-2.5L21 20zM7.5 6.5a1.8 1.8 0 1 0 0-.1',
  'license-fee': 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5',
  legal: 'M12 4v16M6 20h12M5 8h14M8 8l-3 6h6zM16 8l-3 6h6z',
  family: 'M8 11a3 3 0 1 0 0-.1M17 12a2.4 2.4 0 1 0 0-.1M2 20c0-3.3 2.7-5 6-5s6 1.7 6 5M15 20c0-2.3 1.3-3.6 3.5-3.6S22 17.7 22 20',
  burial: 'M7 21V9a5 5 0 0 1 10 0v12zM12 6v6M9.5 8.5h5',
  other: 'M5 12a1.6 1.6 0 1 0 0-.1M12 12a1.6 1.6 0 1 0 0-.1M19 12a1.6 1.6 0 1 0 0-.1',
};

const icon = (key) => html`<span class="ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
  ><path d="${esc(ICON_PATHS[key] ?? ICON_PATHS.other)}"/></svg></span>`;

/**
 * A search box, rendered hidden and revealed by app.js.
 *
 * Server-rendering it hidden is the whole trick: a visitor without JavaScript
 * never sees a control that would do nothing, and still gets the full list.
 */
const filterBar = ({ target, label, placeholder, chips = [] }) => html`
  <div class="filter" data-filter data-filter-target="${esc(target)}">
    <div class="filter-row">
      <label class="visually-hidden" for="filter-input">${esc(label)}</label>
      <input type="search" id="filter-input" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
      <span class="filter-count" data-filter-count aria-live="polite"></span>
    </div>
    ${chips.length
      ? html`<div class="chips">${chips.map((chip) => html`<button type="button" class="chip"
          data-filter-chip="${esc(chip.key)}" aria-pressed="false">${esc(chip.label)}</button>`)}</div>`
      : ''}
  </div>`;

/**
 * A paid placement.
 *
 * Renders NOTHING when no live sponsor matches, so slots can exist in the
 * layout long before anything is sold and never leave a hole. Ads are data
 * here, not code: no third-party script, and the creative is served from our
 * own origin because a hotlinked image can be swapped after we approved it.
 */
function sponsorCard(live) {
  return html`
    <aside class="sponsor" aria-label="Sponsored">
      <p class="sponsor-flag">Sponsored</p>
      <a href="${escUrl(live.destinationUrl)}" rel="sponsored noopener">
        ${live.image ? html`<img src="${escUrl(live.image)}" alt="${esc(live.imageAlt ?? '')}" loading="lazy" decoding="async">` : ''}
        <span class="sponsor-copy">
          <strong>${esc(live.headline)}</strong>
          ${live.body ? html`<span>${esc(live.body)}</span>` : ''}
          <em>${esc(live.ctaLabel ?? 'Learn more')}</em>
        </span>
      </a>
      <p class="sponsor-by">Paid placement by ${esc(live.advertiser)}. Paying never affects what we list or how we rank it.</p>
    </aside>`;
}

function sponsorSlot(slot, jurisdictionCode = null) {
  return placedSponsors(sponsors, slot, jurisdictionCode).map(sponsorCard).join('');
}

function discountCard(discount) {
  const stale = daysSince(discount.verifiedAt) > DISCOUNT_STALE_AFTER_DAYS;
  const where = discount.reach === 'national'
    ? 'Nationwide'
    : [discount.city, discount.jurisdiction].filter(Boolean).join(', ');

  return html`<article class="card" data-filter-item
    data-category="${esc(discount.category)}"
    data-search="${esc(`${discount.business} ${discount.summary} ${where} ${DISCOUNT_CATEGORY_LABELS[discount.category] ?? ''}`)}">
    <h3>${esc(discount.business)}</h3>
    <p class="tag">${esc(DISCOUNT_CATEGORY_LABELS[discount.category] ?? discount.category)} · ${esc(where)}</p>
    ${discount.offer ? html`<p class="amount">${esc(discount.offer)}</p>` : ''}
    <p>${esc(discount.summary)}</p>
    ${discount.eligibility?.length
      ? html`<details><summary>Who qualifies</summary><ul>${discount.eligibility.map((e) => html`<li>${esc(e)}</li>`)}</ul></details>`
      : ''}
    ${discount.howToRedeem ? html`<details><summary>How to redeem</summary><p>${esc(discount.howToRedeem)}</p></details>` : ''}
    ${discount.verificationService ? html`<p class="admin">Verified through ${esc(discount.verificationService)}</p>` : ''}
    <p class="contact"><a href="${escUrl(discount.officialUrl)}" rel="noopener">Offer details</a></p>
    ${discount.paidPlacement ? html`<p class="sponsor-flag inline">Paid placement</p>` : ''}
    ${confidenceNote(discount)}
    ${stale
      ? html`<p class="stale">Last checked ${esc(discount.verifiedAt)}. Discounts change without notice, so confirm at the register.</p>`
      : ''}
    ${sourceLine(discount)}
  </article>`;
}

const SUBSECTION_LABEL = {
  3: '501(c)(3) charity',
  4: '501(c)(4) social welfare',
  19: '501(c)(19) armed forces',
};

/**
 * One nonprofit, as a compact row.
 *
 * Deliberately not a card. There are up to 293 of these on a page, and cards at
 * that density are unreadable and weigh several megabytes.
 *
 * The 501(c) subsection is shown on every row because donors routinely assume
 * any nonprofit is a c3 and that giving is deductible. For a c4 it generally is
 * not, and that is worth knowing before you give.
 */
const nonprofitRow = (org) => html`<li class="np" data-filter-item
  data-category="c${esc(org.irsSubsection)}"
  data-search="${esc(`${org.name} ${org.city ?? ''} ${SUBSECTION_LABEL[org.irsSubsection] ?? ''} ${org.nteeCode ?? ''}`)}">
  <div class="np-main">
    <strong>${esc(org.name)}</strong>
    <small>${esc(org.city ?? '')}${org.city ? ' · ' : ''}${esc(SUBSECTION_LABEL[org.irsSubsection] ?? 'Registered nonprofit')}</small>
  </div>
  <a href="${escUrl(org.website)}" rel="nofollow noopener">Filings</a>
</li>`;

const empty = (what, jurisdictionName) => html`<div class="empty">
  <p><strong>We have not published ${esc(what)} for ${esc(jurisdictionName)} yet.</strong></p>
  <p>This page exists because ${esc(jurisdictionName)} Veterans deserve one. We are
  filling jurisdictions in one at a time and verifying each entry against the official
  source rather than publishing everything at once and hoping it is right.</p>
</div>`;

// ------------------------------------------------------------------ homepage

const withData = jurisdictions.filter((j) => j.benefits.length || j.organizations.length);

const hero = readJson(join(process.cwd(), 'data', 'curated', 'hero.json'), null);

/**
 * Homepage hero: headline, call to action, and a three-across video band.
 *
 * Every clip is self-hosted, muted, and loops. Each one also renders its poster
 * as a real `img`, and under prefers-reduced-motion the CSS hides the video and
 * shows that image instead. That is how the band respects motion sensitivity
 * with no JavaScript: the site runs none, and the CSP has no script-src clause
 * at all, so a scripted solution was never on the table.
 *
 * The videos are decorative, so they are aria-hidden and out of the tab order.
 * The captions carry whatever meaning the band has.
 */
function heroBand(config) {
  return config.videos.slice(0, 3).map((item) => {
    const isPhoto = item.type === 'image' || (!item.src && item.poster);
    return html`
      <div class="hero-panel">
        ${isPhoto
          ? html`<img src="${escUrl(item.poster ?? item.src)}" alt="" decoding="async">`
          : html`<video autoplay muted loop playsinline preload="auto" poster="${escUrl(item.poster)}">
               <source src="${escUrl(item.src)}" type="video/mp4">
             </video>
             <img class="hero-still" src="${escUrl(item.poster)}" alt="" decoding="async">`}
      </div>`;
  });
}

page('/', layout({
  title: 'Home',
  path: '/',
  description: SITE.description,
  jsonLd: {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: SITE.name, url: SITE.url, description: SITE.description,
  },
  body: html`
    <section class="hero full-bleed">
      ${hero?.videos?.length
        ? html`<div class="hero-media" aria-hidden="true">
             <div class="hero-band">${heroBand(hero)}</div>
             <div class="hero-scrim"></div>
           </div>
           <ul class="hero-captions" aria-hidden="true">${hero.videos.slice(0, 3).map((v) =>
             html`<li><span>${esc(v.caption ?? '')}</span></li>`)}</ul>`
        : ''}

      <div class="wrap hero-content">
        <div class="hero-headline">
          <h1>Know what you <em>earned</em>.</h1>
        </div>

        <div class="hero-copy">
          <p class="hero-sub">Every Veteran benefit, every state, one place.</p>
          <p class="lede">${esc(hero?.lede ?? SITE.description)}</p>
          <p class="hero-actions">
            <a class="button" href="${escUrl(hero?.ctaHref ?? '/states/')}">${esc(hero?.ctaLabel ?? 'Find your state')}</a>
            <a class="button button-ghost" href="${escUrl('/organizations/')}">Browse organizations</a>
          </p>
        </div>

        <ul class="stats">
          <li><b>${esc(jurisdictions.length)}</b><span>Jurisdictions</span></li>
          <li><b>${esc(federal.length)}</b><span>Federal benefits</span></li>
          <li><b>${esc(benefits.length - federal.length)}</b><span>State benefits</span></li>
          <li><b>${esc(organizations.length)}</b><span>Organizations</span></li>
        </ul>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Start with your state</h2></div>
      <p class="lede">Counts show what each state or territory offers on its own. Every page also
      carries the ${esc(federal.length)} federal benefits, which are the same wherever you live.</p>
      ${filterBar({ target: '#state-grid', label: 'Filter states and territories', placeholder: 'Search states and territories' })}
      <ul class="grid states" id="state-grid">
        ${jurisdictions.map((j) => html`<li data-filter-item data-search="${esc(`${j.name} ${j.code}`)}">
          <a href="${escUrl(`/${j.slug}/`)}" data-count="${esc(j.organizations.length + j.benefits.length)}">
            <strong>${esc(j.name)}</strong>
            <small>${esc(j.organizations.length + j.benefits.length)} listing${j.organizations.length + j.benefits.length === 1 ? '' : 's'}</small>
          </a>
        </li>`)}
      </ul>
      <p class="no-results" data-filter-empty hidden>No state or territory matches that. Check the spelling, or clear the box to see all ${esc(jurisdictions.length)}.</p>
    </section>

    <section class="promise">
      <h2>How we work</h2>
      <div class="grid three">
        <div><h3>Every entry is sourced</h3><p>Each listing links to the government or organization page it came from, with the date we last checked it. If we cannot source it, we do not publish it.</p></div>
        <div><h3>We show you when data is old</h3><p>Benefit rules change quietly. Anything we have not re-checked in ${esc(STALE_AFTER_DAYS)} days is labeled on the page instead of being quietly served as current.</p></div>
        <div><h3>Territories are not an afterthought</h3><p>Guam, Puerto Rico, American Samoa, the US Virgin Islands, and the Northern Marianas get the same treatment as the 50 states. Most "national" resources skip them.</p></div>
      </div>
    </section>

    <section class="warn">
      <h2>Never pay for help with a VA claim</h2>
      <p>
        Accredited Veterans Service Organizations file claims for free, by law. Anyone who
        asks for a percentage of your back pay or a fee to "unlock" your rating is not
        acting in your interest. Every organization we list as accredited is checked
        against VA's own accreditation records.
      </p>
    </section>
  `,
}));

// --------------------------------------------------------------- state index

page('/states/', layout({
  title: 'All states and territories',
  path: '/states/',
  description: 'Veteran benefits and organizations in all 50 states, DC, and the 5 US territories.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'States and territories' }],
  body: html`
    <h1>All states and territories</h1>
    <p class="lede">Every US jurisdiction, including the territories that most national Veteran resources leave out.</p>
    ${['state', 'district', 'territory'].map((type) => {
      const group = jurisdictions.filter((j) => j.type === type);
      const heading = { state: 'States', district: 'District of Columbia', territory: 'US territories' }[type];
      return html`<section>
        <h2>${esc(heading)}</h2>
        <ul class="grid states">
          ${group.map((j) => html`<li><a href="${escUrl(`/${j.slug}/`)}">
            <strong>${esc(j.name)}</strong>
            <small>${esc(j.organizations.length + j.benefits.length)} listing${j.organizations.length + j.benefits.length === 1 ? '' : 's'}</small>
          </a></li>`)}
        </ul>
      </section>`;
    })}
  `,
}));

// ---------------------------------------------------------- jurisdiction pages

for (const j of jurisdictions) {
  const total = j.benefits.length + j.organizations.length;
  const byCategory = new Map();
  for (const benefit of j.benefits) {
    if (!byCategory.has(benefit.category)) byCategory.set(benefit.category, []);
    byCategory.get(benefit.category).push(benefit);
  }

  page(`/${j.slug}/`, layout({
    title: `${j.name} Veteran benefits and resources`,
    path: `/${j.slug}/`,
    description:
      `Veteran benefits, state agencies, and organizations in ${j.name}. ` +
      'Every entry links to its official source and shows when it was last checked.',
    breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'States', href: '/states/' }, { label: j.name }],
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `${j.name} Veteran benefits and resources`,
      url: `${SITE.url}/${j.slug}/`, about: { '@type': 'AdministrativeArea', name: j.name },
    },
    body: html`
      <h1>${esc(j.name)} Veteran benefits and resources</h1>
      <p class="lede">
        ${total
          ? html`${esc(total)} published listing${total === 1 ? '' : 's'} for Veterans in ${esc(j.name)}, each linked to its official source.`
          : html`We are still building out ${esc(j.name)}. Start with your state agency below.`}
      </p>

      ${j.stateAgency
        ? html`<section class="callout">
            <h2>Start here: your state Veteran agency</h2>
            <p>Every state-level benefit runs through this office. They can also connect you
            with a free, accredited service officer in your county.</p>
            ${orgCard(j.stateAgency)}
          </section>`
        : html`<section class="callout">
            <h2>Start here</h2>
            <p>We have not confirmed a state Veteran agency listing for ${esc(j.name)} yet.
            The national Veterans Crisis Line and VA benefits hotline at
            <a href="tel:18008271000">1-800-827-1000</a> can point you to local help in the meantime.</p>
          </section>`}

      <section>
        <h2>Benefits and programs</h2>

        <p class="lede">Every category below appears on every state and territory page, so you always
        know what to look for. A category with nothing in it means we have not published it for
        ${esc(j.name)} yet, not that ${esc(j.name)} offers nothing.</p>

        <ul class="cat-index">
          ${CATEGORIES.map((category) => {
            const count = byCategory.get(category.key)?.length ?? 0;
            return count
              ? html`<li><a href="#cat-${esc(category.key)}">${icon(category.key)}<b>${esc(category.label)}</b><small>${esc(count)}</small></a></li>`
              : html`<li class="is-empty"><span>${icon(category.key)}<b>${esc(category.label)}</b><small>none yet</small></span></li>`;
          })}
        </ul>

        ${CATEGORIES.map((category) => {
          const list = byCategory.get(category.key) ?? [];
          return html`
            <section class="cat-section${list.length ? '' : ' is-empty'}" id="cat-${esc(category.key)}">
              <h3 class="cat">${esc(category.label)}</h3>
              <p class="cat-blurb">${esc(category.blurb)}</p>
              ${list.length
                ? html`<div class="grid two">${list.map(benefitCard)}</div>`
                : html`<p class="cat-none">Nothing published for ${esc(j.name)} yet.</p>`}
            </section>`;
        })}
      </section>

      ${sponsorSlot('jurisdiction', j.code)}

      ${federal.length
        ? html`<section class="federal">
            <div class="section-head"><h2>Federal benefits <small>available in every state</small></h2></div>
            <p class="lede">These come from the VA, not from ${esc(j.name)}, so they are the same
            wherever you live. Most Veterans are eligible for more of these than they realise.</p>
            <div class="grid two">${federal.map(benefitCard)}</div>
          </section>`
        : ''}

      ${j.nonprofits.length
        ? html`<section>
            <div class="section-head"><h2>Nonprofits <small>${esc(j.nonprofits.length)} registered</small></h2></div>
            <p class="lede">${esc(j.nonprofits.length)} IRS-registered nonprofits serve Veterans in
            ${esc(j.name)}. Registration is not a recommendation, so each listing links to its
            financial filings.</p>
            <p><a class="button button-ghost" href="${escUrl(`/nonprofits/${j.slug}/`)}">Browse ${esc(j.name)} nonprofits</a></p>
          </section>`
        : ''}

      <section>
        <h2>Organizations</h2>
        ${j.organizations.length
          ? html`<div class="grid two">${j.organizations.filter((o) => o !== j.stateAgency).map(orgCard)}</div>`
          : empty('an organization directory', j.name)}
        ${j.organizations.length === 1 && j.stateAgency ? empty('additional organizations', j.name) : ''}
      </section>
    `,
  }));
}

// ------------------------------------------------------- organization index

const byType = new Map();
for (const org of organizations) {
  if (!byType.has(org.orgType)) byType.set(org.orgType, []);
  byType.get(org.orgType).push(org);
}

page('/organizations/', layout({
  title: 'Organization directory',
  path: '/organizations/',
  description: 'Directory of Veteran organizations, state agencies, and service offices across the United States.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Organizations' }],
  body: html`
    <h1>Organization directory</h1>
    <p class="lede">${esc(organizations.length)} organizations serving Veterans, grouped by what they do.</p>

    ${sponsorSlot('organizations')}

    ${filterBar({
      target: '#org-list',
      label: 'Filter organizations',
      placeholder: 'Search by name, state, or service',
      chips: [...byType.keys()].sort().map((type) => ({ key: type, label: ORG_TYPE_LABELS[type] ?? type })),
    })}
    <p class="no-results" data-filter-empty hidden>No organization matches that yet.</p>
    <div id="org-list">
    ${[...byType.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([type, list]) => html`
      <section data-filter-group>
        <div class="section-head"><h2>${esc(ORG_TYPE_LABELS[type] ?? type)} <small>${esc(list.length)}</small></h2></div>
        <div class="grid two">${list.sort((a, b) => a.name.localeCompare(b.name)).map((org) => html`<div
          data-filter-item data-category="${esc(org.orgType)}"
          data-search="${esc(`${org.name} ${org.jurisdiction} ${org.city ?? ''} ${(org.services ?? []).join(' ')}`)}"
        >${orgCard(org)}</div>`)}</div>
      </section>`)}
    </div>
  `,
}));

// ------------------------------------------------------------------ search

page('/search/', layout({
  title: 'Search',
  path: '/search/',
  description: 'Search every benefit, organization, discount, and jurisdiction on USVetHub.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Search' }],
  body: html`
    <h1>Search</h1>
    <p class="lede">Everything on this site except the nonprofit registry, which is large enough
    to browse state by state instead.</p>

    <div class="search-page" data-search-page hidden>
      <label class="visually-hidden" for="q">Search benefits, organizations, and discounts</label>
      <input type="search" id="q" data-search-input autocomplete="off" spellcheck="false"
        placeholder="Property tax, Texas, tuition waiver, hiring preference">
      <p class="search-note" data-search-status role="status" aria-live="polite"></p>
      <ol class="search-results" data-search-results></ol>
    </div>

    <noscript>
      <p><strong>Search needs JavaScript, and this page does not have it.</strong>
      Nothing is hidden from you: everything search would find is browsable below.</p>
    </noscript>

    <div class="search-fallback" data-search-fallback>
      <h2>Browse instead</h2>
      <ul class="plain">
        <li><a href="${escUrl('/benefits/')}">Benefits by state and territory</a>, all ${esc(jurisdictions.length)} of them</li>
        <li><a href="${escUrl('/organizations/')}">Organization directory</a>, filterable by what each one does</li>
        <li><a href="${escUrl('/discounts/')}">Discounts</a>, filterable by business and category</li>
        <li><a href="${escUrl('/nonprofits/')}">Veteran nonprofits</a>, listed state by state</li>
        <li><a href="${escUrl('/free-help/')}">Free help</a>, including who may lawfully charge for a claim</li>
      </ul>
    </div>
  `,
}));

// -------------------------------------------------------------- data health

const statusRow = (source) => html`<tr class="row-${esc(source.status)}">
  <td>${esc(source.sourceId)}</td>
  <td>${esc(source.status)}</td>
  <td>${esc(source.recordCount)}</td>
  <td>${esc(source.reason ?? '')}</td>
</tr>`;

page('/data-health/', layout({
  title: 'Data health',
  path: '/data-health/',
  description: 'Live status of every data source behind USVetHub, including anything currently broken.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Data health' }],
  body: html`
    <h1>Data health</h1>
    <p class="lede">
      Every source we pull from, and whether it is currently working. We publish this
      openly because a resource guide that hides its own staleness is not trustworthy.
    </p>
    <p class="stat">
      ${esc(health.ok)} healthy · ${esc(health.warned)} with warnings · ${esc(health.failed)} failing
      ${health.generatedAt ? html`· last run ${esc(health.generatedAt.slice(0, 16).replace('T', ' '))} UTC` : ''}
    </p>
    ${health.sources.length
      ? html`<table class="health">
          <thead><tr><th>Source</th><th>Status</th><th>Records</th><th>Notes</th></tr></thead>
          <tbody>${health.sources.map(statusRow)}</tbody>
        </table>`
      : html`<p>No sources have run yet.</p>`}
    <h2>What a failure means</h2>
    <p>
      When a source fails, we keep serving the last data we successfully verified from it,
      and we mark it here. We never replace good data with an empty or suspicious result.
      If a scraper suddenly finds 2 benefits where it previously found 40, we treat that as
      the scraper breaking rather than as 38 benefits being repealed.
    </p>
    ${site.loadIssues.length
      ? html`<h2>Files skipped at build time</h2><ul>${site.loadIssues.map((i) => html`<li>${esc(i)}</li>`)}</ul>`
      : ''}
  `,
}));

// -------------------------------------------------------------------- about

page('/about/', layout({
  title: 'About',
  path: '/about/',
  description: 'What USVetHub is, how we source information, and what we will never do.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'About' }],
  body: html`
    <h1>About USVetHub</h1>
    <p class="lede">
      A free guide to what every state offers Veterans, built because the information
      exists but is scattered across 56 jurisdictions and hundreds of agency websites.
    </p>

    <h2>How we source information</h2>
    <p>
      We collect information that agencies and organizations already publish, restructure
      it so it can be compared across states, and link back to the original. Every entry
      carries the source it came from and the date we last checked it. We prefer official
      government APIs over reading web pages, because a structured feed does not silently
      break when a site is redesigned.
    </p>

    <h2>What we will never do</h2>
    <ul class="plain">
      <li>Charge a Veteran for anything on this site.</li>
      <li>Accept advertising from anyone charging Veterans to file a VA claim. Accredited help is free by law, and paid claim services are a well-documented way Veterans lose money.</li>
      <li>Present ourselves as the authority. We are a signpost. The agency is the authority.</li>
      <li>Collect personal information you did not choose to give us.</li>
    </ul>

    <h2>Corrections</h2>
    <p>
      If something here is wrong, it matters, and we want to know. Wrong benefit
      information can cost a Veteran a filing deadline. A correction address will be
      published here before launch.
    </p>
  `,
}));

page('/about/bot/', layout({
  title: 'Information for webmasters',
  path: '/about/bot/',
  description: 'How the USVetHub crawler behaves, and how to contact us about it.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'About', href: '/about/' }, { label: 'For webmasters' }],
  body: html`
    <h1>Information for webmasters</h1>
    <p class="lede">
      If you found <code>USVetHubBot</code> in your access logs, this page explains what it
      is and how to make it stop.
    </p>
    <h2>What it does</h2>
    <p>
      USVetHubBot collects publicly published information about benefits and services for
      US Veterans so that it can be indexed by state and linked back to you. We send
      traffic to you, not away from you: every entry we publish links to your page as the
      authoritative source.
    </p>
    <h2>How it behaves</h2>
    <ul class="plain">
      <li>It identifies itself honestly in the user agent string, with a link to this page.</li>
      <li>It waits between requests and has a hard per-run request ceiling.</li>
      <li>It caches aggressively, so a repeated run costs you nothing.</li>
      <li>It reads public pages only. It does not attempt logins, forms, or paywalled content.</li>
    </ul>
    <h2>Asking us to stop</h2>
    <p>
      Disallow <code>USVetHubBot</code> in your robots.txt and we will stop. If you would
      rather we kept the listing but pulled from a feed or API you maintain, we would much
      prefer that. Get in touch and we will switch to it.
    </p>
  `,
}));

// ------------------------------------------------------------------ benefits

page('/benefits/', layout({
  title: 'Veteran benefits',
  path: '/benefits/',
  description: 'Federal Veteran benefits plus what every state and territory offers on top of them.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Benefits' }],
  body: html`
    <h1>Veteran benefits</h1>
    <p class="lede">Benefits come from two places. Federal benefits are the same wherever you live.
    State benefits are on top of those and vary a lot, which is why the same Veteran can be worth
    thousands more in one state than another.</p>

    <div class="section-head"><h2>Federal benefits <small>the same in every state</small></h2></div>
    ${federal.length
      ? html`<div class="grid two">${federal.map(benefitCard)}</div>`
      : html`<p class="cat-none">Nothing published yet.</p>`}

    <div class="section-head"><h2>By state and territory</h2></div>
    <p class="lede">Counts show what each place offers on its own, on top of the federal benefits above.</p>
    ${filterBar({ target: '#benefits-state-grid', label: 'Filter states', placeholder: 'Search states and territories' })}
    <ul class="grid states" id="benefits-state-grid">
      ${jurisdictions.map((j) => html`<li data-filter-item data-search="${esc(`${j.name} ${j.code}`)}">
        <a href="${escUrl(`/${j.slug}/`)}" data-count="${esc(j.benefits.length)}">
          <strong>${esc(j.name)}</strong>
          <small>${esc(j.benefits.length)}</small>
        </a>
      </li>`)}
    </ul>
    <p class="no-results" data-filter-empty hidden>No state or territory matches that.</p>
  `,
}));

// ----------------------------------------------------------------- discounts

page('/discounts/', layout({
  title: 'Veteran discounts',
  path: '/discounts/',
  description: 'Verified discounts for Veterans and service members, confirmed on each business own website.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Discounts' }],
  body: html`
    <h1>Veteran discounts</h1>
    <p class="lede">Every offer here was confirmed on the business's own website, not copied from a
    coupon site. Discounts change without notice, so we show you when we last checked and link you
    straight to the source.</p>

    ${sponsorSlot('discounts')}

    ${discounts.length
      ? html`
        ${filterBar({
          target: '#discount-list',
          label: 'Filter discounts',
          placeholder: 'Search by business, category, or place',
          chips: DISCOUNT_CATEGORIES
            .filter((c) => discounts.some((d) => d.category === c.key))
            .map((c) => ({ key: c.key, label: c.label })),
        })}
        <p class="no-results" data-filter-empty hidden>No discount matches that yet.</p>
        <div class="grid two" id="discount-list">${discounts.map(discountCard)}</div>`
      : html`<div class="empty">
          <p><strong>The discount directory is being built.</strong></p>
          <p>We are only publishing offers we have confirmed on the business's own website. That is
          slower than scraping a list, and it is the entire point: a directory of discounts that do
          not work at the register is worse than no directory at all.</p>
        </div>`}

    <section class="warn">
      <h2>How this stays honest</h2>
      <p>A business can pay to be featured here, and if it does, the listing says
      <strong>Paid placement</strong> on its face. Paying never affects whether we list a business or
      where it appears. If an offer is wrong, tell us and we will pull it.</p>
    </section>
  `,
}));

// ----------------------------------------------------------------- free help

const freeHelp = organizations
  .filter((o) => FREE_HELP_ORG_TYPES.includes(o.orgType))
  .sort((a, b) => a.name.localeCompare(b.name));

page('/free-help/', layout({
  title: 'Free help',
  path: '/free-help/',
  description: 'Free, accredited help for Veterans: claims assistance, legal aid, tax preparation, and crisis support.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Free help' }],
  body: html`
    <h1>Free help</h1>
    <p class="lede">Some of the most valuable help available to you costs nothing, and a lot of
    Veterans pay for it anyway because nobody told them.</p>

    <section class="warn">
      <h2>Never pay to file a VA claim</h2>
      <p>Accredited Veterans Service Organizations file claims for free. That is the law, not a
      courtesy. <strong>Nobody may charge you to file your first claim</strong>, and that includes
      lawyers. After VA issues a decision, an accredited attorney may legally charge to help with an
      appeal, which is a different situation entirely.</p>
      <p class="hero-actions"><a class="button" href="${escUrl('/free-help/paying-for-help/')}">Read the rules on paying for help</a></p>
    </section>

    ${sponsorSlot('free-help')}

    <div class="section-head"><h2>Right now, at no cost</h2></div>
    <div class="grid three">
      <div>
        <h3>Crisis support</h3>
        <p>Call or text <a href="tel:988">988</a> then press <strong>1</strong>, or text
        <a href="sms:838255">838255</a>. Free, confidential, 24 hours a day, for all Veterans and
        their families. You do not need to be enrolled in VA care.</p>
      </div>
      <div>
        <h3>Claims help</h3>
        <p>An accredited service officer will prepare and file your claim at no charge. Your state
        Veteran agency can connect you with one in your county.</p>
      </div>
      <div>
        <h3>VA benefits hotline</h3>
        <p>Call <a href="tel:18008271000">1-800-827-1000</a> for questions about compensation,
        pension, education, and survivor benefits.</p>
      </div>
    </div>

    <div class="section-head"><h2>Organizations offering free help</h2></div>
    ${freeHelp.length
      ? html`
        ${filterBar({ target: '#free-help-list', label: 'Filter free help', placeholder: 'Search by name or state' })}
        <p class="no-results" data-filter-empty hidden>Nothing matches that yet.</p>
        <div class="grid two" id="free-help-list">${freeHelp.map((org) => html`<div
          data-filter-item data-search="${esc(`${org.name} ${org.jurisdiction} ${org.city ?? ''}`)}"
        >${orgCard(org)}</div>`)}</div>`
      : html`<p class="cat-none">Nothing published yet.</p>`}
  `,
}));

page(payingForHelpMeta.path, layout({
  ...payingForHelpMeta,
  breadcrumbs: [
    { label: 'Home', href: '/' },
    { label: 'Free help', href: '/free-help/' },
    { label: 'Paying for help' },
  ],
  body: payingForHelpBody,
}));

// --------------------------------------------------------------- nonprofits

const npDisclaimer = html`
  <section class="warn">
    <h2>Read this before you give</h2>
    <p>Every organization below is registered with the IRS, and that is <strong>all</strong>
    registration means. It is not a recommendation, and it is not evidence that an
    organization is well run or that your money reaches a Veteran. Veteran charities have a
    long and documented history of raising money that mostly pays for more fundraising.</p>
    <p><strong>Check the filings before you donate.</strong> Every listing links to that
    organization's Form 990 financial filings, where you can see what share of spending
    actually goes to programs. That is far harder to fake than a testimonial.</p>
    <p>Note the subsection too. Donations to a <strong>501(c)(3)</strong> are generally tax
    deductible. Donations to a <strong>501(c)(4)</strong> generally are not, which surprises
    a lot of people.</p>
  </section>`;

page('/nonprofits/', layout({
  title: 'Veteran nonprofits',
  path: '/nonprofits/',
  description:
    `${nonprofits.length} IRS-registered nonprofits serving Veterans across the United States, ` +
    'each linked to its financial filings.',
  breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Nonprofits' }],
  body: html`
    <h1>Veteran nonprofits</h1>
    <p class="lede">${esc(nonprofits.length.toLocaleString('en-US'))} organizations registered with
    the IRS as 501(c)(3), 501(c)(4), or 501(c)(19) and serving Veterans. Drawn from the federal
    Exempt Organizations Business Master File, not from a hand-picked list.</p>

    ${npDisclaimer}

    <div class="section-head"><h2>By state and territory</h2></div>
    ${filterBar({ target: '#np-state-grid', label: 'Filter states', placeholder: 'Search states and territories' })}
    <ul class="grid states" id="np-state-grid">
      ${jurisdictions.filter((j) => j.nonprofits.length).map((j) => html`<li data-filter-item data-search="${esc(`${j.name} ${j.code}`)}">
        <a href="${escUrl(`/nonprofits/${j.slug}/`)}">
          <strong>${esc(j.name)}</strong>
          <small>${esc(j.nonprofits.length)}</small>
        </a>
      </li>`)}
    </ul>
    <p class="no-results" data-filter-empty hidden>No state or territory matches that.</p>
  `,
}));

for (const j of jurisdictions.filter((x) => x.nonprofits.length)) {
  page(`/nonprofits/${j.slug}/`, layout({
    title: `Veteran nonprofits in ${j.name}`,
    path: `/nonprofits/${j.slug}/`,
    description: `${j.nonprofits.length} IRS-registered nonprofits serving Veterans in ${j.name}, each linked to its financial filings.`,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Nonprofits', href: '/nonprofits/' },
      { label: j.name },
    ],
    body: html`
      <h1>Veteran nonprofits in ${esc(j.name)}</h1>
      <p class="lede">${esc(j.nonprofits.length)} organizations registered with the IRS and serving
      Veterans in ${esc(j.name)}. Registration is not a recommendation: check the filings.</p>

      ${filterBar({
        target: '#np-list',
        label: `Filter ${j.name} nonprofits`,
        placeholder: 'Search by name or city',
        chips: [
          { key: 'c3', label: '501(c)(3) charities' },
          { key: 'c4', label: '501(c)(4) social welfare' },
          { key: 'c19', label: '501(c)(19) armed forces' },
        ],
      })}
      <p class="no-results" data-filter-empty hidden>Nothing matches that.</p>
      <ul class="np-list" id="np-list">${j.nonprofits.map(nonprofitRow)}</ul>

      ${npDisclaimer}
    `,
  }));
}

// ------------------------------------------------------------- brand review
// Internal reference page. Noindex, and kept out of the sitemap. It exists so
// logo and tagline choices get made by looking at them at real size rather
// than by reading a description of them.

const TAGLINES = [
  { text: 'Every Veteran benefit, every state, one place', note: 'Current. Descriptive and clear. Says exactly what the site is, and nothing about how it feels.' },
  { text: 'You earned it. Go get it.', note: 'Most energetic. Reads as a buddy telling you to stop leaving money on the table. Skews youngest.' },
  { text: 'Know what you earned.', note: 'Calm and confident. Works for a 25 year old and a 75 year old, which few of these do.' },
  { text: 'Every benefit. Every state. No runaround.', note: 'Descriptive plus attitude. The word runaround does the emotional work.' },
  { text: 'Stop guessing. Start claiming.', note: 'Strong call to action. Slightly harder sell, and claiming may read as VA-claims specific.' },
  { text: 'Claim what is yours.', note: 'Short and forceful. Same caveat: claim carries VA baggage.' },
  { text: '50 states. 5 territories. Zero guesswork.', note: 'Leads with the coverage number, which is the genuinely hard part to copy.' },
];

page('/design/', layout({
  title: 'Brand review',
  path: '/design/',
  noindex: true,
  description: 'Internal page for choosing the USVetHub mark and tagline.',
  body: html`
    <h1>Brand review</h1>
    <p class="lede">Internal page. Not linked from anywhere and not in the sitemap.
    Pick one mark and one tagline, then this page can go.</p>

    <div class="section-head"><h2>Marks</h2></div>
    <div class="grid three">
      ${Object.entries(LOGOS).map(([key, logo]) => html`
        <div class="card">
          <div class="logo-row">
            <span>${logo.render(112)}</span>
            <span>${logo.render(48)}</span>
            <span>${logo.render(28)}</span>
            <span>${logo.render(16)}</span>
          </div>
          <div class="logo-row logo-dark">
            <span>${logo.render(112)}</span>
            <span>${logo.render(48)}</span>
            <span>${logo.render(28)}</span>
            <span>${logo.render(16)}</span>
          </div>
          <h3>${esc(logo.name)}</h3>
          <p class="tag">${esc(key)}${key === ACTIVE_LOGO ? ' · in use' : ''}</p>
        </div>`)}
    </div>

    <div class="section-head"><h2>Taglines</h2></div>
    <div class="grid two">
      ${TAGLINES.map((t, i) => html`
        <div class="card">
          <p class="tag">Option ${esc(i + 1)}</p>
          <p class="tagline-sample">${esc(t.text)}</p>
          <p>${esc(t.note)}</p>
        </div>`)}
    </div>
  `,
}));

page('/404.html', layout({
  title: 'Page not found',
  path: '/404.html',
  description: 'That page does not exist.',
  body: html`
    <h1>We could not find that page</h1>
    <p class="lede">It may have moved, or it may not exist yet.</p>
    <p><a class="button" href="${escUrl('/states/')}">Find your state</a></p>
  `,
}));

// ------------------------------------------------------------ static assets

if (existsSync('public')) cpSync('public', OUT, { recursive: true });

// Emit the hashed copies and drop the unhashed originals, so nothing can link
// to a URL that is allowed to go stale.
renameSync(join(OUT, 'styles.css'), join(OUT, CSS_NAME));
renameSync(join(OUT, 'app.js'), join(OUT, JS_NAME));

// CNAME tells Pages to claim the custom domain. Ship it only when this build is
// actually FOR that domain. Shipping it from a github.io subpath build would
// point Pages at a hostname whose DNS is not pointed back yet, taking the site
// offline at both URLs.
const isProductionDomain = new URL(SITE_URL).pathname.replace(/\/+$/, '') === '';
if (!isProductionDomain && existsSync(join(OUT, 'CNAME'))) {
  rmSync(join(OUT, 'CNAME'));
  console.log('  CNAME withheld: this build targets ' + SITE_URL);
}

/**
 * The search index.
 *
 * A prebuilt static file rather than a search service: no third-party script,
 * no query leaving the browser, and nothing to keep running. What someone types
 * into a benefits site says a great deal about their health and their money,
 * and the safest way to hold that is never to receive it.
 *
 * The 11,800 IRS nonprofits are deliberately left out. They would multiply this
 * file by fifty to serve a directory that is already browsable state by state,
 * and a search box that takes a second to load is a search box nobody uses.
 */
const searchIndex = [
  ...jurisdictions.map((j) => ({
    t: j.name, k: 'Jurisdiction', c: `${j.code} · ${j.benefits.length} benefits`,
    u: `/${j.slug}/`, s: `${j.name} ${j.code} state territory benefits`,
  })),
  ...benefits.map((b) => ({
    t: b.title,
    k: CATEGORY_LABELS[b.category] ?? b.category,
    c: b.jurisdiction === 'US' ? 'Federal' : (byCode.get(b.jurisdiction)?.name ?? b.jurisdiction),
    u: b.jurisdiction === 'US' ? '/benefits/' : `/${byCode.get(b.jurisdiction)?.slug ?? ''}/`,
    s: `${b.title} ${b.summary} ${b.agency ?? ''} ${b.statuteRef ?? ''} ${b.jurisdiction}`,
  })),
  ...organizations.map((o) => ({
    t: o.name, k: ORG_TYPE_LABELS[o.orgType] ?? o.orgType,
    c: [o.city, o.jurisdiction].filter(Boolean).join(', '),
    u: '/organizations/',
    s: `${o.name} ${o.jurisdiction} ${o.city ?? ''} ${(o.services ?? []).join(' ')}`,
  })),
  ...discounts.map((d) => ({
    t: d.business, k: 'Discount', c: d.offer ?? '',
    u: '/discounts/', s: `${d.business} ${d.offer ?? ''} ${d.category ?? ''} discount`,
  })),
].map((entry) => ({ ...entry, s: entry.s.toLowerCase().replace(/\s+/g, ' ').trim() }));

writeFileSync(join(OUT, 'search-index.json'), JSON.stringify(searchIndex));

const urls = pages.filter((p) => p !== '/404.html' && p !== '/design/');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${SITE.url}${p}</loc></url>`).join('\n')}
</urlset>
`);

writeFileSync(join(OUT, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`);

console.log(`Built ${pages.length} pages into dist/`);
console.log(`  ${jurisdictions.length} jurisdictions, ${organizations.length} organizations, ${benefits.length} benefits`);
if (site.loadIssues.length) {
  console.log(`  ${site.loadIssues.length} data file(s) skipped:`);
  for (const issue of site.loadIssues) console.log(`    - ${issue}`);
}
const staleCount = [...benefits, ...organizations].filter(isStale).length;
if (staleCount) console.log(`  ${staleCount} record(s) are older than ${STALE_AFTER_DAYS} days and are labeled as such`);
