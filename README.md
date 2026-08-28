# USVetHub

A free guide to what every US state and territory offers Veterans, with a link
to the official source for every entry.

The information already exists. It is just scattered across 56 jurisdictions,
hundreds of agency websites, and a lot of PDFs. This collects it, structures it,
and shows you when it was last checked.

## Quick start

```bash
npm run scrape    # collect data from every source
npm run build     # render dist/
npm run dev       # build and serve at http://localhost:4321
npm test          # isolation and build tests
```

No dependencies to install. Node 20 or newer is the only requirement.

## How it is put together

Two halves that barely know about each other.

**Collection** lives in `pipeline/`. Each data source is a folder containing a
config and an extract function. The runner spawns each one in its own child
process with a timeout, so a source that throws, hangs, or returns nonsense
cannot affect any other source or the site. Output must pass a JSON Schema and a
set of change guards before it replaces data that is already published.

**Rendering** lives in `scripts/build-site.mjs` and reads only
`data/published/`. It is a single zero-dependency file that turns JSON into
static HTML. If every scraper broke tomorrow, the site would still build and
serve the last verified data, with the staleness shown on the page.

## Why it is built this way

The requirements were national coverage, a lot of scraping, compartmentalization
so one failure cannot cascade, and a high security bar. Those point at the same
answer: no server, no database, no runtime, and hard walls between sources.

A static site has almost no attack surface. There is no query to inject into and
no session to steal. The realistic remaining risk is that we scrape something
malicious and render it ourselves, so scraped values are treated as text at
every step: cleaned on the way in, escaped on the way out, and URL schemes other
than `http(s)` are rejected outright.

`npm run test:isolation` proves the containment rather than asserting it. It
runs four deliberately broken sources: one that throws, one that loops forever,
one that returns invalid records including a `javascript:` URL, and one that
simulates a source site redesign by losing 80% of its records. Every one is
contained, and the previously good data survives.

## Contributing data

Most contributions are records, not code. See
[`data/curated/README.md`](data/curated/README.md).

The rule that matters: only mark a record `verified` if you personally opened
its official source and confirmed it. A wrong figure on this site can cost
someone a filing deadline.

## Not the authority

USVetHub is a signpost. Benefit rules change, and they change without telling
us. Every entry links to the agency that actually decides, and shows the date we
last checked. Confirm with that agency, or with a free accredited Veterans
Service Officer, before you act.

**Never pay anyone to file a VA claim. Accredited help is free by law.**
