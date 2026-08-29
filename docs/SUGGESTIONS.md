# Suggestions log

Every idea, recommendation, warning, and open question raised while building
USVetHub. Nothing here is a commitment. Items move to `Decided` when Tony picks
one, and to `Rejected` when he rules one out, so we never re-litigate.

Add to this file whenever a suggestion comes up, in any session. Newest entries
at the bottom of each section. Date every entry.

Status key: **OPEN** needs a decision · **DECIDED** settled, see the note ·
**REJECTED** ruled out, reason recorded · **DONE** built.

---

## Decided

| # | Date | Suggestion | Outcome |
|---|---|---|---|
| 1 | 2026-08-28 | Static site generated at build time, published to GitHub Pages | **DECIDED.** No server and no database means almost no attack surface, and static pages rank best, which is what the ad business needs. |
| 2 | 2026-08-28 | Domain `usvethub.com` | **DECIDED.** Already owned. |
| 3 | 2026-08-28 | Phase 1 covers state benefits by jurisdiction, plus the organization directory | **DECIDED.** VA facilities and crisis resources come in Phase 2. |
| 4 | 2026-08-28 | Keep AZVLC and azveterans separate, share code only | **DECIDED.** No live dependency between the Arizona sites and the national one. |
| 5 | 2026-08-28 | One folder per data source, each run in its own child process with a timeout | **DECIDED.** This is the compartmentalization Tony asked for. One broken scraper cannot stop the others or break the build. |
| 22 | 2026-08-28 | Write the site generator by hand instead of using Astro or another framework | **DECIDED, with a revisit trigger.** A directory site is a data-to-HTML renderer, and a framework would add several hundred dependencies to a project whose main requirement is security. The whole generator is one file. **Revisit when** we start publishing articles regularly: at that point Markdown authoring, tags, and RSS are enough real work that a framework starts paying for itself. |
| 23 | 2026-08-28 | Deploy only `dist/` as the Pages artifact, never the repo root | **DECIDED.** This structurally fixes the AZVLC problem where the deploy workflow had to strip files to avoid publishing them. Here, nothing outside `dist/` can be published, because nothing else is ever uploaded. |

---

## Open

### Data and sources

| # | Date | Suggestion | Why it matters |
|---|---|---|---|
| 6 | 2026-08-28 | Register for a VA Lighthouse API key at developer.va.gov | **OPEN.** Free, and the Facilities API is the authoritative source for hospitals, clinics, and Vet Centers. Sandbox access is instant; production needs an approval step. Prefer official APIs over scraping everywhere one exists. Needed before Phase 2. |
| 7 | 2026-08-28 | Prefer APIs over scraping, always | **OPEN as a standing rule.** Candidates worth checking: data.gov, Congress.gov API, NCES for schools, HUD for housing, SAMHSA for treatment locators. Scraping is the fallback, not the default. |
| 8 | 2026-08-28 | Every record carries a source URL and a `verifiedAt` date, shown on the page | **OPEN.** Both a trust feature and a legal shield. We are pointing Veterans at benefits, so we must never look like the authority. Always link to the official page. |
| 9 | 2026-08-28 | Keep a human-curated seed layer under the scraped layer | **BUILT** as `curated-benefits`, currently empty. Still **OPEN**: curated and scraped records are separate sources today, so neither overrides the other. Decide the precedence rule before both cover the same benefit. |
| 24 | 2026-08-28 | Check for a WordPress REST API before writing any government-site scraper | **OPEN as a standing technique.** A large share of `.gov` sites run WordPress with `/wp-json/wp/v2/` open. That is how `va-state-offices` works: one request returning typed fields, instead of thirty page fetches that break on a redesign. Check `/wp-json/wp/v2/types` first, every time. |
| 25 | 2026-08-28 | Old `va.gov` URLs still meta-refresh to their new homes | **OPEN as a technique.** `va.gov/statedva.htm` is a dead-looking 931-byte page that redirects to the current directory. When a VA source disappears, the legacy URL is a good place to pick the trail back up. |
| 26 | 2026-08-28 | Hand-curate the three missing state offices | **OPEN, small and concrete.** VA's own directory has no entry for **Idaho, American Samoa, or the Northern Mariana Islands**. All three have Veteran offices in reality. 53 of 56 jurisdictions are covered automatically; these three need a person. |
| 27 | 2026-08-28 | Add county Veteran Service Officers | **OPEN.** The state agency is the front door, but the county service officer is who a Veteran actually sits down with. There are roughly 3,000 of them and no single national list, so this is the largest data project on the roadmap and probably the most valuable. |

### Trust, legal, and safety

| # | Date | Suggestion | Why it matters |
|---|---|---|---|
| 10 | 2026-08-28 | Written advertising policy before the first ad runs | **OPEN.** Veterans are heavily targeted by claim sharks, predatory for-profit schools, and VA-loan refi churn. Some of it pays extremely well. Taking that money would poison the brand we are building and could draw regulatory attention. Decide the line in writing while it is still hypothetical. |
| 11 | 2026-08-28 | Never render scraped HTML as HTML | **OPEN, treat as a hard rule.** A scraped page can contain a `<script>` tag. Everything scraped gets text-extracted and escaped. This is the single most likely way a static site still gets compromised. |
| 12 | 2026-08-28 | Crisis resources need special handling | **OPEN.** The Veterans Crisis Line (988, press 1) should be correct and reachable from every page. Stale or wrong crisis info is the one error with a real human cost. Consider hardcoding it rather than scraping it. |
| 13 | 2026-08-28 | Check each state site's terms and `robots.txt` before scraping it | **OPEN.** Federal works are public domain, but state sites vary. Rate limit politely and identify the crawler honestly. |
| 14 | 2026-08-28 | No PII in this repo, ever | **OPEN, standing rule.** The AZVLC lesson: a private GitHub repo still publishes every file it gives Pages to the open web. Any future contact form or submission queue lives in a separate, unpublished repo. |

### Site and product

| # | Date | Suggestion | Why it matters |
|---|---|---|---|
| 15 | 2026-08-28 | Build search from a prebuilt static index | **OPEN.** Pagefind or similar. Keeps search working with no server and no query endpoint to attack. |
| 16 | 2026-08-28 | "Compare my state to another" feature | **OPEN.** Nobody does this well, and it is the kind of page that earns links. A Veteran deciding where to retire genuinely wants it. |
| 17 | 2026-08-28 | Staleness is shown, never hidden | **OPEN.** If a source has not refreshed, the page says so instead of quietly serving old data. Builds trust and protects us. |
| 18 | 2026-08-28 | Capitalize Veteran everywhere | **DECIDED.** House rule carried over from AZVLC, now in `CLAUDE.md`. |
| 28 | 2026-08-28 | Publish a public data-health page | **BUILT** at `/data-health/`. Shows every source and anything currently failing. Worth keeping even when it is embarrassing: a resource guide that hides its own staleness is not trustworthy. |
| 29 | 2026-08-28 | A "compare two states" page | **OPEN, refinement of 16.** The data model already supports it, since every benefit is categorized and jurisdiction-tagged. Blocked only on having benefit records to compare. |
| 31 | 2026-08-28 | Decide whether to rewrite lowercase "veterans" inside scraped descriptions | **OPEN, needs Tony.** Our house rule capitalizes Veteran, but several state agency descriptions we pull from VA say "Alaska's veterans" in the agency's own words. Right now we publish them verbatim. Editing a quoted description to match our style is a small misrepresentation of someone else's copy. The alternative is that our own prose and the quoted prose disagree on the same page. Leaning toward leaving quotes verbatim and keeping the rule for copy we write. |
| 30 | 2026-08-28 | Do not launch publicly until several states have real benefit data | **OPEN.** Right now 56 pages exist and 53 have one organization each. That is honest, and the empty states say so plainly, but it is not yet worth promoting. Suggest 5 to 10 fully curated states before any launch push. |

### Business and media

| # | Date | Suggestion | Why it matters |
|---|---|---|---|
| 19 | 2026-08-28 | Newsletter before ads | **OPEN.** Display ads need traffic that does not exist yet. An email list is the asset that makes the media company real, and sponsorships pay far better per reader than display. |
| 20 | 2026-08-28 | Paid verified listings for organizations | **OPEN.** A directory listing upgrade is a cleaner revenue line than display ads and does not require huge traffic. Needs care so paid placement never outranks accuracy. |
| 21 | 2026-08-28 | Nonprofit or for-profit structure | **OPEN, needs a real answer early.** It changes funding, grant eligibility, and how ads work. Tony already runs a 501(c)(4) with AZVLC, so there is a precedent to weigh. |

---

## Rejected

| # | Date | Suggestion | Why not |
|---|---|---|---|
| - | - | - | - |
