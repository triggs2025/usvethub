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

Revised 2026-08-29 after Tony pushed back on a blanket ban on paid claims
help, and he was right to. The earlier draft said "nobody who charges a fee".
That is too blunt, and it would have excluded lawyers Veterans genuinely need
when they are fighting a denial.

### Paid claims help: the line is legal, not editorial

Federal law already draws this line, which means we do not have to invent one
and cannot be argued out of it.

- **Only VA-accredited attorneys and claims agents may charge a fee at all.**
  38 U.S.C. 5904 and 38 CFR 14.636.
- **They may only charge for work done after VA has issued a decision** on the
  initial claim. Charging for an initial claim is prohibited, accredited or not.
- **Accredited VSO representatives are always free.** Never paid, by anyone.
- A fee agreement over 20 percent of past-due benefits is one VA will not pay
  directly, which is a signal worth noticing.

So there is a legitimate paid lane: an accredited attorney representing a
Veteran on an appeal after a denial. That is real work, often genuinely
necessary, and refusing to let those advertisers reach Veterans would not
protect anyone.

**The predator is not "someone who charges". It is someone charging for an
initial claim, or someone charging without accreditation.** Both are unlawful.

### What an advertiser in this category must produce

Any advertiser whose `advertiserCategory` is `claims-representation` is
approved only after ALL of the following. The schema will not validate a sponsor
record without them.

1. **VA accreditation number**, verified against the VA Office of General
   Counsel accreditation search. Record the date it was checked.
2. **A live interview** with Tony. Not a form submission. Record who conducted
   it and when.
3. **LinkedIn, Facebook or business page, and a direct contact name.** An
   advertiser unwilling to be identifiable is telling you something.
4. **Confirmation in writing that they do not charge for initial claims.**
5. **Their creative must not imply** that paying is necessary, faster, or that
   free accredited help is inferior.

Re-verify accreditation at every renewal. Accreditation can be revoked, and a
lapsed one is exactly the case worth catching.

**We will still not accept advertising from:**

- Anyone charging for an **initial** VA claim. This is unlawful, not merely
  distasteful, and no interview makes it acceptable.
- Anyone charging a fee for claims work **without VA accreditation**.
- Pension poaching, structured settlement buyouts, or anyone offering a lump sum
  in exchange for future benefit payments.
- Anything requiring a payday-style APR disclosure.
- For-profit education lead generation targeting GI Bill benefits.

### Why the bar is higher now that this is a for-profit

Decided 2026-08-29: USVetHub is a for-profit company. That cuts against us here
and it is worth being honest about.

A nonprofit turning down a lucrative advertiser looks principled. A for-profit
doing it is giving up money it wanted. That is precisely why the rule has to be
written down, tied to an objective federal test, and enforced by a schema that
refuses the record, rather than left to a judgement call made in a month where
revenue is short.

**Every paid placement is labeled "Sponsored"** in text, adjacent to the
creative, not only in a corner badge.

**Paid placement never affects ranking or inclusion in the directory.** A
sponsor and a non-sponsor with the same relevance sort identically. Ad slots are
visually separated from directory content.

## Implementation: built 2026-08-30

This was a sketch until the slots were built ahead of the first sale, on the
principle that a slot which only works once you have an advertiser is a slot you
find out is broken on the day you take money. All of it now exists and is
covered by `npm test`.

To create an ad: copy `data/curated/sponsors/_template.json`, fill it in, run
`npm run scrape:one curated-sponsors` to validate it, and `npm run status` to
see where it will run and what is still unsold.

**How placement works.** Omit `jurisdictions` for a national buy and one record
runs on all 56 pages. List state codes for a targeted buy. On a given state
page a targeted buy is placed ahead of a national one, so an advertiser who paid
to reach Arizona is not pushed off the Arizona page by whoever was created
first. Two ads per slot maximum. Ordering is deterministic, so two builds of the
same book produce identical pages.

**What the tests refuse to let through:** a creative that is not self-hosted, an
unexpired flight with no named `policyReviewedBy`, a claims-representation
advertiser without both a VA accreditation number and a recorded verification
date, an ad that is not labeled Sponsored, a destination link missing
`rel="sponsored noopener"`, a slot in the schema that no page renders, and an
expired or unstarted flight reaching a page. `npm run status` reports the same
set as blocking problems, and `npm run status -- --strict` exits non-zero on any
of them.

The original sketch, kept because it is the reasoning:

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
