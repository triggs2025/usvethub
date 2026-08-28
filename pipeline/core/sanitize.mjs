/**
 * Everything scraped passes through here before it is allowed anywhere near a
 * record.
 *
 * The threat: a state agency page (or a page that redirects to one) contains
 * markup or a crafted link. If we ever pass that through to a template
 * unescaped, our static site serves someone else's script to Veterans. Static
 * hosting does not save us from stored XSS if we author the store ourselves.
 *
 * So the rule is absolute: scraped values are TEXT. Never HTML.
 */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&mdash;': '-', '&ndash;': '-', '&rsquo;': "'",
  '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&hellip;': '...',
};

/** Collapse whitespace, decode entities, strip any residual tags. */
export function cleanText(input) {
  if (input == null) return '';
  let text = String(input);

  // Strip tags first so "<b>x</b>" does not become "x" with a stray bracket.
  text = text.replace(/<[^>]*>/g, ' ');

  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  text = text.replace(/&#(\d+);/g, (_, code) => {
    const n = Number(code);
    return n >= 32 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
  });

  // Any angle bracket that survived decoding is neutralized, not preserved.
  text = text.replace(/[<>]/g, ' ');

  // Control characters, soft hyphens, bidi overrides, zero-width joiners, BOM.
  // Invisible in review, visible in output, and a known homograph trick.
  text = text.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\u2060\ufeff]/g, ' ');

  // House rule: no em dashes anywhere in published copy.
  text = text.replace(/[—–]/g, ', ');

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve and vet a URL found on a scraped page.
 * @returns {string|null} an absolute http(s) URL, or null if it is not safe
 */
export function cleanUrl(href, base) {
  if (!href) return null;
  const raw = cleanText(href);
  if (!raw) return null;

  let parsed;
  try {
    parsed = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  // Credentials in a URL are either a mistake or an attack. Never keep them.
  parsed.username = '';
  parsed.password = '';

  return parsed.toString();
}

/** US phone number, normalized for display, or null if it is not one. */
export function cleanPhone(input) {
  const digits = cleanText(input).replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** Lowercased email, or null. Deliberately conservative. */
export function cleanEmail(input) {
  const text = cleanText(input).toLowerCase().replace(/^mailto:/, '');
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(text) ? text : null;
}

/** URL-safe slug. Used for file names and page routes, so keep it strict. */
export function slugify(input) {
  return cleanText(input)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
