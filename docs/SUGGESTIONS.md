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
| 31 | 2026-08-28 | Quoted text from a source is published verbatim | **DECIDED by Tony: leave the quotes verbatim.** Several state agency descriptions say lowercase "veterans" in the agency's own words. We do not edit them to match our house capitalization. The Veteran rule governs copy we write, not copy we quote. Editing someone else's published words to fit our style would misattribute an editorial stance to them, and this site's whole value is being an accurate signpost. Typographic normalization that does not change words still applies: collapsing whitespace, decoding entities, and converting em dashes. |

---

## Open

### Data and sources

| # | Date | Suggestion | Why it matters |
|---|---|---|---|
| 41 | 2026-08-29 | Every jurisdiction page shows the full category set | **DECIDED by Tony, BUILT.** All 15 categories appear on all 56 pages, including Jobs and employment, Schooling and education, and Entrepreneurship and business. Categories with nothing in them are shown greyed and unlinked rather than hidden, so a Veteran in Guam gets the same shape of page as one in Texas, and the coverage gaps are visible to us as well as to them. |
| 42 | 2026-08-29 | Arizona benefits sourced from statute, not the agency site | **DONE for 5 records.** dvs.az.gov, azdor.gov, and azgfd.com all sit behind a WAF that blocks automated requests, so the records cite azleg.gov statute text instead. That is arguably the better source anyway: it is authoritative, stable, and does not change wording between site redesigns. Worth reusing for other states whose agency sites block us. |
| 43 | 2026-08-29 | Deliberately did NOT publish the current property tax exemption dollar figure | **OPEN, needs a human with browser access.** The statute says $4,188 and the Department of Revenue adjusts it annually for inflation; a search result suggested $4,873 for 2026 but that could not be confirmed against a primary source. Rather than publish an unverified number, the record explains the mechanism and tells the reader to confirm with their county assessor. Get the real figure and add it. |
| 44 | 2026-08-29 | Arizona still needs jobs, business, health, housing, burial, and legal records | **OPEN.** Five categories are filled and ten are empty. Known gaps with real Arizona programs behind them: state hiring preference, Veteran-owned business certification, the Arizona State Veteran Homes, and the three Arizona Veterans' Memorial Cemeteries. |
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
| 32 | 2026-08-29 | Advertising is a requirement, not a maybe | **DECIDED by Tony: build it in, securely.** Full plan in [ADVERTISING.md](ADVERTISING.md). Direct-sold first-party creatives, no third-party ad JavaScript, no programmatic. Not implemented yet: it waits for a first advertiser so we build the real shape rather than a guess. |
| 45 | 2026-08-29 | Widen the CSP to script-src 'self' so the site can be interactive | **DECIDED by Tony: make it modern and interactive.** This is a real step down from "no script can run at all", and it is recorded as a deliberate trade rather than a drift. Still no 'unsafe-inline', no CDN, no host allowlist: the only script that can execute is a file we wrote and serve. Everything in `public/app.js` is progressive enhancement, the filter controls render hidden and are revealed only if the script runs, and a build test fails if they ever ship visible. |
| 59 | 2026-08-29 | Chevron mark is gold, not navy | **DECIDED by Tony.** Gold is already the site's accent, so a navy mark was a second one. The opacity fade had to change with it: 1 / 0.66 / 0.34 worked in navy but left the lower two chevrons almost invisible in gold on a white masthead, so the floor was raised to 1 / 0.74 / 0.5. Light mode uses the mid gold, dark mode the brighter one. |
| 47 | 2026-08-29 | Logo: Chevron rise | **DECIDED by Tony.** Three ascending rank chevrons. Reads as military to anyone who served and as upward momentum to anyone who did not, survives at 16px, and works in one flat colour for embroidery. Lives in `src/lib/logos.mjs`; the other two candidates are kept there and switchable by changing `ACTIVE_LOGO`. |
| 48 | 2026-08-29 | Tagline: "Know what you earned." | **DECIDED by Tony.** Calm and confident, and it works for a 25 year old and a 75 year old, which almost none of the alternatives did. It also states the emotional premise of the site: the benefits are already yours, the only problem is finding them. The descriptive line stays as a subhead and in the title tag so search keywords are not lost. |
| 49 | 2026-08-29 | Front page was too dark | **DONE.** Masthead is now white, and the hero is a warm amber-to-sky wash rather than a navy slab. Dark mode still gets a dark hero. Headline highlight is a painted underline rather than gradient-clipped text, because clipped text disappears entirely in Windows high-contrast mode. |
| 55 | 2026-08-29 | Full operational documentation so Tony can fix the site without help | **DECIDED by Tony, DONE.** [RUNBOOK.md](RUNBOOK.md) is written for someone at 11pm who did not build this: a decision tree for "the site is down", the common scraper failures and what each means, and a one-command rollback that cannot lose data. [SECURITY.md](SECURITY.md) states the threat model, what protects the site, and the gaps it does not close. Both name the weakest link honestly: with no server and no database, the realistic compromise path is the GitHub account, so hardware-key 2FA matters more than anything else. |
| 56 | 2026-08-29 | Fingerprint CSS and JS filenames | **DONE.** A cached stylesheet applied to new markup rendered the homepage as an unstyled pile. Assets are now content-addressed, so a stale pair is impossible rather than unlikely, and a build test fails if an unhashed copy is ever published. |
| 57 | 2026-08-29 | Hero stats span the content width | **DONE.** Four equal grid columns rather than a flex row, so the figures align to the same left and right edges as the headline and paragraph above them. |
| 51 | 2026-08-29 | Real hero footage: Marines hiking, handshake, Veteran thanked | **DONE.** Tony supplied all three. 32.25 MB of source became 1.19 MB, about 96 percent smaller, well inside the 12 MB budget. Encoded at 760px wide, CRF 31, 24fps, faststart, and with the audio track stripped entirely: the panels are muted, so an audio stream was pure wasted bandwidth. The exact ffmpeg command is recorded in `hero.json` so future clips are encoded the same way. |
| 52 | 2026-08-29 | Hero is full width with the words over the video | **DECIDED by Tony, DONE.** The three clips run edge to edge behind the copy as one continuous strip, separated by a 1px hairline. The scrim is deliberately directional rather than a flat wash: a concentrated pool behind the words plus a light left-to-right gradient, so the type keeps a dark backing while the footage stays bright. A flat scrim heavy enough for legibility would have made the page dark again, which is the exact thing Tony objected to. |
| 53 | 2026-08-29 | The leftmost clip sits under the heaviest scrim | **OPEN, minor.** Measured average luma: hiking 57, handshake 108, thanked 70. The hiking clip is genuinely dark footage and it occupies the third with the most scrim over it, so it reads as a dark cinematic edge rather than as visible action. It was graded up slightly at encode. If it matters, the cleanest fix is a brighter clip in slot one, since the caption order Served, Connected, Supported is a narrative and should not be reshuffled. |
| 54 | 2026-08-29 | Releases for the hero footage | **RESOLVED. Tony holds signed releases for all three clips**, confirmed 2026-08-29, and will not display the documents on the site. Recorded as a pointer in the `release` field of each panel in `hero.json`. The documents, signatures, names, and contact details stay out of this repo entirely: it is public, and Pages publishes every file it is given. A build test now fails if release text ever reaches the published HTML. Still worth adding the filing location to the pointer so the paperwork is findable later. |
| 50 | 2026-08-29 | Real photography is what the page is actually missing | **DECIDED by Tony: add photography.** Full brief in [IMAGERY.md](IMAGERY.md). The hero panels now accept a still image as well as a video clip, so photos drop in with no code change. **Blocked on Tony supplying or licensing images.** Two things in that doc matter most: Veterans spot fake stock instantly, especially uniform errors and the sunset salute, so showing Veterans in present-day civilian life is both safer and truer. And public domain solves copyright but not publicity rights, so a signed model release is still needed for every identifiable person on a commercial site. |
| 46 | 2026-08-29 | Visual overhaul: dark full-bleed hero, depth, motion, icons | **DONE.** Tony called the first version bland and he was right. Full-bleed navy hero with a gradient headline, big stat numbers, card hover lift, gold spines on the state tiles, inline SVG category icons, and a sticky masthead. Icons are inline SVG rather than an icon font because a font or sprite request would be a third party the CSP refuses. |
| 33 | 2026-08-29 | Add a Content Security Policy now, while the site runs zero JavaScript | **DONE.** `default-src 'none'` with no `script-src` clause at all, shipped as a meta tag. Verified live with no console violations. Any future script has to widen it deliberately, which is the point. `frame-ancestors` is omitted because browsers ignore it in a meta tag and Pages cannot send headers: an accepted gap, recorded rather than hidden. |
| 34 | 2026-08-29 | Cut over to usvethub.com when DNS is ready | **OPEN, one action for Tony then one line for us.** Point the apex A records at 185.199.108-111.153 at GoDaddy and add a `www` CNAME to `triggs2025.github.io`. Then delete the two `SITE_BASE_URL` lines in `deploy.yml`: the build default is already the production domain and starts shipping CNAME again automatically. |
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
| 38 | 2026-08-29 | Hero footage is Veterans, families, and service dogs | **DECIDED by Tony.** File names describe the footage (`veterans`, `families`, `service-dogs`); captions carry the message (Served, Connected, Supported). Tony chose to keep the original captions rather than label the clips literally. |
| 39 | 2026-08-29 | Get signed releases before any identifiable person appears in the hero | **OPEN, and it is a real legal step, not a formality.** This is a commercial site that will carry advertising, so implied consent does not cover it. Every person on screen needs a signed release, and children need a parent or guardian signature. `hero.json` has a `release` field per clip to record where each one is filed. |
| 40 | 2026-08-29 | Be careful how service dogs are depicted | **OPEN, worth a moment.** Service dogs and emotional support animals are legally distinct, and Veterans notice the difference immediately. Footage should show a dog behaving as a working service animal, ideally vested. Getting this visibly wrong on the homepage would cost credibility with exactly the audience we are trying to earn. |
| 35 | 2026-08-29 | Hero band of three side-by-side videos | **DECIDED by Tony, BUILT.** Self-hosted, muted, looping, stacking on mobile, with poster stills that replace the video under prefers-reduced-motion. Currently placeholder gradients totalling 160 KB. Config lives in `data/curated/hero.json` so the clips and copy swap without code. |
| 36 | 2026-08-29 | Decide where real video is hosted before the footage arrives | **OPEN, and it matters sooner than it looks.** GitHub Pages is a soft 100 GB/month of bandwidth and a 1 GB repo, and it is explicitly not meant for media hosting. Three autoplay clips on the busiest page is the fastest way to find both limits. A build test now fails above 12 MB of video. If real footage is bigger, move it to Cloudflare R2 or Stream and widen `media-src` to that one host, rather than raising the budget. |
| 37 | 2026-08-29 | Keep hero clips short, silent, and small | **OPEN as a standing rule.** Autoplay video hurts Largest Contentful Paint, and Core Web Vitals feed the search traffic the ad business depends on. It also costs mobile data, which matters for the audience. Suggest 6 to 10 second loops, no audio track at all, 854x480 or smaller, and never more than three. |
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
| 58 | 2026-08-29 | Star chevron: red, white and blue chevrons on a gold star | **REJECTED by Tony after seeing it.** Two problems it had regardless of taste: it was the only mark with fixed colours, so it could not inherit currentColor and would need a separate one-colour version drawn for embroidery or a stamp. And a star's usable interior is only its central pentagon, roughly a third of the bounding box, so the chevrons had to be small enough that the mark turned to mud at 16px. Built and viewed rather than argued about, which is what the brand page is for. |
