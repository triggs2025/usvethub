/**
 * Templating primitives.
 *
 * The one rule that matters: every value interpolated into a page goes through
 * esc(). Our data is scraped from third-party sites, so treating it as trusted
 * is how a static site still ends up serving someone else's script.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for HTML text and double-quoted attribute contexts. */
export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Escape a URL for an href. Returns '#' for anything that is not http(s), so a
 * bad link renders as a dead link instead of an executable one.
 */
export function escUrl(value) {
  if (!value) return '#';
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '#';
    return esc(parsed.toString());
  } catch {
    // Site-relative paths are ours, so they are safe, but still escape them.
    return String(value).startsWith('/') ? esc(value) : '#';
  }
}

/** Tagged template that escapes every interpolation. Arrays are joined. */
export function html(strings, ...values) {
  return strings.reduce((out, str, i) => {
    if (i === 0) return str;
    const value = values[i - 1];
    const rendered = Array.isArray(value) ? value.join('') : value;
    return out + (rendered ?? '') + str;
  });
}

/** Marks a string as already-safe HTML built by our own code. */
export const raw = (value) => value ?? '';

export const SITE = {
  name: 'USVetHub',
  tagline: 'Every Veteran benefit, every state, one place',
  url: 'https://usvethub.com',
  description:
    'A free, plain-language guide to Veteran benefits and organizations in all 50 states, ' +
    'the District of Columbia, and the 5 US territories.',
};

const CRISIS_BAR = `
<div class="crisis" role="complementary" aria-label="Crisis support">
  <strong>In crisis?</strong>
  Call or text <a href="tel:988">988</a> then press <strong>1</strong>, or text
  <a href="sms:838255">838255</a>. Free, confidential, 24 hours a day, for all Veterans
  and their families. You do not need to be enrolled in VA care.
</div>`;

/**
 * @param {object} page
 * @param {string} page.title      appears in the tab and as the h1 unless heading is set
 * @param {string} page.description  meta description, matters for search traffic
 * @param {string} page.path       site-absolute path, used for the canonical URL
 * @param {string} page.body       already-escaped HTML
 * @param {Array}  [page.breadcrumbs]  [{ label, href }]
 */
export function layout({ title, description, path, body, breadcrumbs = [], jsonLd = null }) {
  const fullTitle = path === '/' ? `${SITE.name} · ${SITE.tagline}` : `${title} · ${SITE.name}`;
  const canonical = `${SITE.url}${path}`;

  const crumbs = breadcrumbs.length
    ? html`<nav class="crumbs" aria-label="Breadcrumb"><ol>
        ${breadcrumbs.map(
          (crumb, i) =>
            html`<li>${
              i === breadcrumbs.length - 1
                ? html`<span aria-current="page">${esc(crumb.label)}</span>`
                : html`<a href="${escUrl(crumb.href)}">${esc(crumb.label)}</a>`
            }</li>`,
        )}
      </ol></nav>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || SITE.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || SITE.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${CRISIS_BAR}
<header class="masthead">
  <div class="wrap">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-text"><strong>USVetHub</strong><small>${esc(SITE.tagline)}</small></span>
    </a>
    <nav aria-label="Main">
      <a href="/states/">States</a>
      <a href="/organizations/">Organizations</a>
      <a href="/about/">About</a>
    </nav>
  </div>
</header>
<main id="main" class="wrap">
${crumbs}
${body}
</main>
<footer class="footer">
  <div class="wrap">
    <p class="disclaimer">
      <strong>USVetHub is a signpost, not an authority.</strong>
      We gather and organize publicly published information so it is easier to find,
      and we link every entry to the official source. Benefit rules change, and they
      change without telling us. Always confirm eligibility with the official agency
      or an accredited Veterans Service Officer before you act. Nothing here is legal,
      medical, or financial advice.
    </p>
    <p class="fineprint">
      <a href="/data-health/">Data health</a> ·
      <a href="/about/">About</a> ·
      <a href="/about/bot/">For webmasters</a> ·
      Never pay anyone to file a VA claim. Accredited help is free.
    </p>
  </div>
</footer>
</body>
</html>
`;
}
