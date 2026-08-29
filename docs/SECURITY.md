# Security

What we protect against, how, and what we deliberately do not protect against.
Written plainly so a non-specialist can audit the claims.

---

## The short version

The site is static HTML on GitHub Pages. There is no server running our code,
no database, no user accounts, no login, no forms, and no cookies. Most of the
ways a website gets compromised simply do not exist here, because the machinery
they attack was never built.

That is not an accident. It was the first architectural decision, made because
this site will carry advertising and point Veterans at money.

---

## Threat model: who would actually attack this

| Attacker | Wants | Our exposure |
|---|---|---|
| Opportunistic scanner | Any vulnerable CMS, mass-exploited | **None.** No CMS, no PHP, no admin panel, no database, no version to fingerprint |
| SEO spammer | Inject links into a real site | **Low.** No user input reaches a page. Scraped text is escaped |
| Malvertiser | Serve malicious ads through a real publisher | **This is the real one.** See Advertising below |
| Scammer targeting Veterans | Use our credibility to reach Veterans | **Editorial, not technical.** See below |
| Supply-chain attacker | Compromise a dependency we ship | **Near zero.** The project has no npm dependencies |
| Someone defacing the repo | Push bad content | **Real.** Depends entirely on GitHub account security |

The two that matter are the last three. Everything else the architecture
already handles.

---

## What protects the site

### No server, no database

Nothing to SQL-inject, no shell to escape into, no admin login to brute force,
no session to steal, no server software to leave unpatched. Pages serves files.

### No dependencies

Zero npm packages in the build or on the site. Nothing to `npm audit`, no
lockfile to poison, no maintainer account for someone else to lose. This is why
the project deliberately does not use a framework.

### Scraped content is text, never HTML

The realistic way a static site still serves malicious code is that we scrape it
ourselves and render it. So:

- Everything scraped goes through `cleanText()` on the way in: tags stripped,
  entities decoded, control characters and bidi overrides removed.
- Everything rendered goes through `esc()` on the way out.
- URLs go through `cleanUrl()` and `escUrl()`, which reject anything that is not
  `http` or `https`. A `javascript:` link cannot reach an `href`.

A build test fails if any page contains a script-bearing href. An isolation test
proves a `javascript:` URL is rejected before publication.

### Content Security Policy

Shipped on every page:

```
default-src 'none'; img-src 'self'; media-src 'self'; style-src 'self';
font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'
```

`default-src 'none'` denies everything, then each source is allowed back
individually and only from our own origin. No CDN, no inline script, no
third-party anything. If a script were somehow injected into a page, the browser
would refuse to run it.

**Known gap, stated rather than hidden:** `frame-ancestors` is ignored in a meta
tag and GitHub Pages cannot send real headers, so we cannot block being framed.
With no forms, no cookies, and no session, there is nothing a clickjacker can
usefully steal. Accepted.

### Only `dist/` is published

The deploy uploads the built folder and nothing else. Pipeline code, source
configs, and working files are never on the web because they are never in the
artifact. This structurally prevents the mistake that AZVLC had to strip files
to avoid.

### No secrets exist

No API keys, tokens, or passwords anywhere in the repo or the build. Nothing to
leak, nothing to rotate. Source modules run with a stripped environment
(`PATH` and `NODE_ENV` only), so a compromised scraper could not read
credentials even if any existed.

---

## Compartmentalization: one failure does not become an outage

This was an explicit requirement and it is enforced in code, not by convention.

Each data source is a folder under `pipeline/sources/`. When the pipeline runs,
each one is executed **in its own operating-system process** with a hard
timeout. A source that throws, hangs forever, allocates until it dies, or
returns nonsense is contained by five separate mechanisms:

1. The parent spawns it as a child process and SIGKILLs it on timeout. An
   infinite loop blocks the event loop, so nothing *inside* the process can stop
   it: only an external kill works. This is why sources run out-of-process.
2. A source can write only to its own file, named after itself.
3. Output must pass a JSON Schema before publication.
4. Output must pass change guards: too few records, or too large a drop from
   last time, and the run is refused.
5. On any failure the previously published data is left exactly as it was.

The result: a broken scraper produces **stale data and a loud report**, never a
broken page and never a wrong page. Failures appear publicly at `/data-health/`.

`npm run test:isolation` proves this with four permanently-kept broken fixtures:
one that throws, one that loops forever, one that returns invalid records
including a `javascript:` URL, and one that simulates a site redesign by losing
80 percent of its records. All eight assertions must pass before any deploy.

### The website cannot be taken down by data problems

The site build is a separate step that reads only committed data. It tolerates a
missing, truncated, or hand-corrupted data file by skipping it and reporting it,
because a failed deploy would take down 56 working jurisdictions to punish one
broken file.

---

## Advertising: the real risk

**An ad tag is third-party JavaScript with full access to the page.** It reads
the DOM, sets cookies, and loads further scripts from servers we have never
audited. Essentially every malvertising incident of the last decade worked this
way. Accepting a programmatic ad network would undo most of this document in one
line of markup.

The decision, recorded in [ADVERTISING.md](ADVERTISING.md), is therefore:

- **Direct-sold, first-party creatives only.** An image and a link, hosted by
  us, served from our origin. No third-party script, so the CSP stays intact and
  no cookie consent machinery is needed.
- **Creatives are downloaded and re-hosted, never hotlinked.** A hotlinked image
  is a third-party request that can be swapped for something else after we
  approved it.
- **Every ad is data, not code.** A sponsor record passes the same schema
  validation as everything else, so an expired flight or a malformed URL cannot
  render.

There is also a non-technical attack this defends against, and it is the more
likely one: **a scammer buying credibility.** Veterans are heavily targeted by
paid VA-claim services, pension poaching, and for-profit school lead generation,
all of which pay well. Running those ads would be a security failure in every
sense that matters to a reader. The written advertising policy exists to make
that refusal a standing commitment rather than a judgment call under revenue
pressure.

---

## Privacy

- No cookies, no analytics, no tracking pixels, no fingerprinting.
- No user accounts, no forms, nothing collected.
- `Referrer-Policy: strict-origin-when-cross-origin`, so outbound clicks to
  agencies reveal our domain and nothing about the visitor's path.
- **No personal information in the repository, ever.** It is public, and Pages
  publishes every file it is given. Office contact details that an organization
  publishes itself are fine; anything about a private individual is not.
- Model releases for hero footage are recorded as a *pointer only*. The
  documents, names, and signatures stay out of the repo. A build test fails if
  release text ever reaches the published HTML.

If a contact form is ever added, it must write to a separate, unpublished
repository. This is the AZVLC lesson: a private GitHub repo does **not** make
the published site private.

---

## The weakest link: the GitHub account

With no server and no database, the realistic compromise path is someone getting
into the `triggs2025` GitHub account and pushing malicious content.

**Do these:**

1. **Hardware key or authenticator app for 2FA.** Not SMS: SIM swapping is a
   standard attack and a Veteran-focused property is a plausible target.
2. **Review the account's authorized OAuth apps** periodically and remove
   anything unrecognized.
3. **Branch protection on `main`** if anyone else ever gets write access.
4. **Never add a collaborator who does not need write access.** Read is enough
   for almost everyone, and the repo is public anyway.

If the account is ever compromised, section 3 of the [RUNBOOK](RUNBOOK.md)
restores any previous state with one command, because all history is in git.

---

## Incident response

1. **Do not panic and do not force push.** The site is static; a bad deploy
   serves bad HTML, it does not expose a database, because there isn't one.
2. **Revert** using RUNBOOK section 3. Live again in about 30 seconds.
3. **Then investigate**, with the site already safe.
4. If the GitHub account itself is suspected: change the password, revoke all
   sessions and tokens, re-check 2FA, then review recent commits for anything
   you did not author.

---

## What this does not protect against

Stated plainly, because a security document that claims everything is covered is
not trustworthy.

- **Being framed by another site.** No `frame-ancestors` without real headers.
- **Denial of service.** GitHub's problem, not ours, and out of our control.
- **A compromised GitHub account.** Mitigated by 2FA, not eliminated.
- **Wrong information.** The largest real-world risk to a Veteran reading this
  site is not a hacker, it is a benefit figure that is out of date. That is what
  the source attribution, the `verifiedAt` date, the staleness labels, and the
  public `/data-health/` page exist to address.
