# Advertising and the media business

Plan, not yet built. Written down now because the decisions are much cheaper to
make before there is revenue attached to them.

## The tension, stated honestly

The site is secure largely because it is static and runs no third-party code. A
visitor loads HTML and CSS from one origin and nothing else. There is no query
to inject into, no session to steal, and no vendor script that can be
compromised upstream.

**Programmatic advertising would undo most of that in one step.** An ad tag is
third-party JavaScript with full access to the page. It reads the DOM, sets
cookies, and loads further scripts from servers we have never heard of. Every
malvertising incident in the last decade worked this way.

So the question is not "ads or no ads". It is "which kind of ads", and the
answer changes the security model, the legal obligations, and the brand.

## The options, ranked

### 1. Direct-sold, first-party creatives · RECOMMENDED

An advertiser sends an image and a destination URL. We host the image ourselves,
render a plain `<a><img></a>`, and record the sale in a curated JSON file like
every other record on the site.

- **No third-party JavaScript.** The Content Security Policy stays strict.
- **No cookies, so no consent banner** and no GDPR or CCPA machinery.
- **No ad-network cut.** A $500 direct sale is $500.
- **Full control over who advertises.** This is the decisive advantage. See below.
- Cost: someone has to sell it. This is the real work.

### 2. Newsletter sponsorships

No site JavaScript at all, because it is not on the site. Sponsorships
historically pay far more per reader than display, and an email list is an asset
that survives a search algorithm change. **Suggest doing this before display
ads**, since display needs traffic that does not exist yet.

### 3. Ethical ad networks (EthicalAds, Carbon and similar)

One small script, no behavioral tracking, no cookies. A reasonable middle path
if direct sales are slow. Lower revenue than programmatic, much lower risk.
Requires one CSP exception, which should be a narrow allowlist of that one host.

### 4. Google AdSense and programmatic · NOT RECOMMENDED

Highest fill rate and the obvious default, and the wrong choice here for one
reason that has nothing to do with security:

**We would not control who advertises to Veterans on our pages.**

Programmatic networks will serve VA claim consultants who charge a percentage of
back pay, for-profit college lead generation, and VA-loan refinance churn. Those
advertisers bid well precisely because targeting Veterans is lucrative. A site
whose homepage says *never pay anyone to file a VA claim* cannot run an ad for a
company charging Veterans to file claims. It would be the single fastest way to
destroy the trust the entire project depends on.

## The advertising policy

Draft. Publish it publicly at `/advertising/` before the first ad runs, so it is
a commitment rather than an intention.

**We will not accept advertising from:**

- Anyone charging Veterans a fee or a percentage to prepare, file, or appeal a
  VA claim. Accredited representation is free by law.
- Unaccredited claim agents and "claim consultants" generally.
- For-profit education lead generation targeting GI Bill benefits.
- Pension poaching, structured settlement buyouts, or anyone offering a lump sum
  in exchange for future benefit payments.
- Anything requiring a payday-style APR disclosure.

**Every paid placement is labeled "Sponsored"** in text, adjacent to the
creative, not only in a corner badge.

**Paid placement never affects ranking or inclusion in the directory.** A
sponsor and a non-sponsor with the same relevance sort identically. Ad slots are
visually separated from directory content.

## Implementation sketch

When there is a first advertiser, not before:

1. `data/curated/sponsors/*.json` with a `sponsor` schema in `data/schema/`:
   advertiser, creative image, destination URL, flight dates, slot, and the
   policy-review sign-off. It passes the same validation gate as everything else,
   so an expired flight or a malformed URL cannot render.
2. Creatives are **downloaded and served from our origin**, never hotlinked. A
   hotlinked image is a third-party request that can be swapped after approval.
3. A `renderSlot(slotId)` helper in `src/lib/` that renders nothing when no
   flight is active. Empty slots must collapse, not leave holes.
4. Destination URLs get `rel="sponsored noopener"`, which is what Google
   requires and what keeps the link from passing ranking signal.
5. A build test asserting that no creative is hotlinked and every active flight
   has a sign-off field.

## Content Security Policy

Not yet set, and it should be, before ads exist rather than after. GitHub Pages
cannot send custom headers, so this ships as a `<meta http-equiv>` tag with the
tradeoff that `frame-ancestors` and `report-uri` will not work.

Starting point for the current, ad-free site:

```
default-src 'none';
img-src 'self';
style-src 'self';
font-src 'self';
base-uri 'none';
form-action 'none';
frame-ancestors 'none'
```

Note there is no `script-src` allowance at all, because the site runs no
JavaScript. Every future addition should have to justify widening this.

## Other revenue worth considering

- **Verified organization listings.** A paid upgrade in the directory is a
  cleaner line than display advertising, needs far less traffic to be worth
  doing, and is a service to the organization rather than a tax on the reader.
  Requires a hard rule that paying never affects accuracy or ordering.
- **Grants.** A Veteran information resource is fundable. Relevant to the
  open question about whether this is a nonprofit or a for-profit.
