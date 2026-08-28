# USVetHub · national Veteran resource guide

A free, plain-language guide to Veteran benefits and organizations across all 56
US jurisdictions: 50 states, DC, and the 5 inhabited territories. Heavy on
scraped and API-sourced data. Long term it also becomes a media property.

## Where it lives

- **Live site:** https://usvethub.com (GitHub Pages, custom domain via
  `public/CNAME`)
- **Local:** `C:\Users\triggs\usvethub` · outside the `Claude Code` container
  folder, like Skilled Vets
- **Repo:** not yet pushed. Branch will be `main`.

## The one architectural idea

**Data collection and site rendering are completely separate, and every data
source is sandboxed from every other one.**

```
pipeline/sources/<id>/     one folder per source, the isolation boundary
        |  each runs in its own child process, killed on timeout
        v
data/published/<type>/<id>.json    validated output, committed to git
        |  the site reads ONLY this
        v
scripts/build-site.mjs -> dist/    static HTML, deployed to Pages
```

A source can throw, hang forever, return garbage, or try to inject a
`javascript:` URL. None of it reaches another source, and none of it breaks the
site. Proven by `npm run test:isolation`, which is a real regression suite, not
decoration. Run it before touching anything in `pipeline/core/`.

## Commands

```bash
npm run scrape                       # run every enabled source
npm run scrape:one va-state-offices  # run one source
npm run scrape:list                  # what is registered
npm run build                        # data -> dist/
npm run dev                          # build, then serve at localhost:4321
npm test                             # isolation + build tests
```

## Layout

| Path | What it is |
|---|---|
| `pipeline/core/` | Runner, worker, fetch client, validator, sanitizer. No scraping logic. |
| `pipeline/sources/<id>/` | One source. `source.config.json` plus `extract.mjs`. |
| `pipeline/sources/zz-test-*/` | Deliberately broken fixtures for the isolation tests. Never enable. |
| `data/schema/` | JSON Schema per record type. The gate everything passes through. |
| `data/published/` | Validated output. Committed. The site's only input. |
| `data/curated/` | Hand-written records. The layer a person edits. |
| `data/snapshots/`, `data/reports/` | One step of rollback, and run health. |
| `src/lib/` | `html.mjs` (escaping, layout), `data.mjs` (loading). |
| `scripts/build-site.mjs` | The whole static site generator. |

## Adding a source

Create `pipeline/sources/<id>/` with a `source.config.json` and an
`extract.mjs` that default-exports `async ({ fetchText, fetchJson, log, config })
=> records[]`. Nothing else in the codebase changes. Then
`npm run scrape:one <id>`.

Set `guards.minRecords` and `guards.maxDropRatio` honestly. They are what
catches a source site redesign before it wipes a state's page.

## House rules

- **Veteran is always capitalized.** Same rule as AZVLC.
- **No em dashes** anywhere, in code comments, copy, or replies. Period, comma,
  colon, or middot. `cleanText()` strips them from scraped data automatically.
- **Prefer an official API over scraping a page.** `va-state-offices` uses
  discover.va.gov's WordPress REST API instead of parsing the rendered page. It
  is one request instead of thirty and it does not break on a redesign.
- **Never mark a record `verified` you have not personally checked** against its
  `officialUrl`. Incomplete is recoverable. Confidently wrong is not, and a bad
  figure here can cost a Veteran a filing deadline.
- **Track every suggestion in `docs/SUGGESTIONS.md`.** Tony asked for a running
  log. Add to it in every session, date the entry, and move items between Open,
  Decided, and Rejected rather than deleting them.

## Gotchas

- **A private repo does NOT make the site private.** GitHub Pages publishes
  whatever it is handed. This repo is safer than AZVLC's because only `dist/` is
  uploaded as the Pages artifact, so `pipeline/`, configs, and working files are
  never published. Do not change that in `deploy.yml`.
- **No PII in this repo, ever.** Office contact details published by an
  organization are fine. Anything about a private individual is not. If a
  contact form is ever added, it writes to a separate, unpublished repo.
- **Scraped values are text, never HTML.** Everything goes through
  `cleanText()` on the way in and `esc()` on the way out. A state agency page
  containing a `<script>` tag is the realistic way a static site still serves
  someone else's code.
- **`--only` does not rewrite `health.json`.** A single-source run says nothing
  about the other sources, so it must not overwrite the report the public
  `/data-health/` page is built from.
- **Source modules get a stripped environment** (`PATH` and `NODE_ENV` only).
  If a source ever legitimately needs an API key, pass it explicitly in
  `run.mjs` rather than removing the stripping.
- **The scrape workflow does not run with `--strict`.** A failing source must
  not fail the job, because that would skip the commit and throw away every
  source that did work. Failures surface on `/data-health/` and in a separate
  final step.
- **VA Lighthouse APIs need a key** (`api.va.gov` returns 401 without one).
  Free, but it is an application. Needed before the Phase 2 facilities work.

## Status

Phase 1, in progress. Working: the pipeline, the isolation guarantees, 56
jurisdiction pages, and 54 state Veteran agencies from VA's own directory.

Not built yet: benefit records (the curated layer exists and is empty), county
service officers, search, and anything media or revenue related. See
`docs/SUGGESTIONS.md`.

Known data gaps: VA's directory has no state office for **Idaho, American
Samoa, or the Northern Mariana Islands**. Those three need hand-curation.
