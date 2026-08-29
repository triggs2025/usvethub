# Runbook

For the person fixing this at 11pm without help. Written to be followed by
someone who did not build it.

Everything here assumes only: a computer, Node 20 or newer, git, and access to
the GitHub account. There are no other dependencies, no server to log into, and
no database.

---

## 1. The 60-second mental model

Two halves that barely know about each other.

```
pipeline/sources/<id>/    scrapers. one folder each, fully isolated.
        |  each runs in its own process, killed if it hangs
        v
data/published/*.json     validated data, COMMITTED TO GIT
        |  the website reads only this
        v
scripts/build-site.mjs -> dist/    plain HTML
        |
        v
GitHub Actions -> GitHub Pages     the live site
```

**The single most important fact:** the live site is static HTML. There is no
server running our code, no database, and no login. If every scraper broke
today, the site would keep serving the last good data indefinitely.

**The second most important fact:** `data/published/` is committed to git. The
data is never lost. Any past state can be restored with a git command.

---

## 2. "The site is down"

Work down this list. Stop when you find the answer.

### Is it actually down?

Open https://triggs2025.github.io/usvethub/ in a private browsing window. If it
loads there but not in your normal browser, it is your browser cache, not the
site. The site is fine.

### Check GitHub's own status

https://www.githubstatus.com

If GitHub Pages is degraded, nothing on our side is broken and nothing on our
side will fix it. Wait it out.

### Check whether the last deploy failed

https://github.com/triggs2025/usvethub/actions

A red X on the most recent "Build and deploy to Pages" run means the deploy
failed. **A failed deploy does not take the site down.** Pages keeps serving the
previous successful build. You have time.

Click the failed run and read the first red step. The usual causes:

| What the log says | What happened | Fix |
|---|---|---|
| A test name followed by FAIL | A build test caught a real problem | See section 4 |
| `no such file or directory` | A file referenced in code was deleted | Restore it, see section 5 |
| `Unexpected token` / `SyntaxError` | Bad edit to a `.mjs` or `.json` file | Section 5 |
| Nothing obvious | Transient GitHub issue | Re-run the job from the Actions page |

### Site loads but looks unstyled or broken

Almost always a stale cache. The stylesheet is content-hashed
(`styles.<hash>.css`) specifically to prevent this, so if it still happens:

1. Hard refresh: Ctrl+Shift+R.
2. Check that the deploy actually finished in the Actions tab.
3. Confirm `dist/` in the newest run contained a `styles.*.css` file.

---

## 3. Emergency: put the site back to how it was

This is the safest button you have. It cannot lose data.

```bash
git log --oneline -20
```

Find the last commit that was known good, copy its short id, then:

```bash
git revert --no-edit <that-commit-id>..HEAD
git push origin main
```

This creates NEW commits that undo the bad ones. It does not delete history,
which means it is reversible if you revert the wrong thing.

**Do not use `git reset --hard` and force push.** It destroys history and it can
lose the published data.

The site redeploys automatically in about 30 seconds.

---

## 4. A scraper broke

**This does not take the site down.** By design, a failed source keeps serving
its last verified data, and the failure is reported publicly at
https://triggs2025.github.io/usvethub/data-health/

To see what happened:

```bash
npm run scrape:one va-state-offices      # run just that source
cat data/reports/va-state-offices.json   # read its report
```

Common report messages and what they mean:

| Reason | Meaning | What to do |
|---|---|---|
| `guard: record count fell from 54 to 3` | The source website changed and our parser now finds almost nothing | Nothing broke on the live site. Old data is still being served. Fix the parser when convenient |
| `timed out after ...ms and was killed` | The source website is slow or hanging | Usually temporary. Re-run tomorrow |
| `HTTP 403` / `HTTP 404` | The source blocked us or moved the page | Find the new URL, update `source.config.json` |
| `N record(s) failed schema validation` | Some records were malformed and were dropped. The good ones published | Look at `rejected` in the report |

**To disable a broken source entirely** so it stops making noise, edit that
source's config file and set `"enabled": false`. Commit.
Its existing data keeps being served.

---

## 5. I broke something editing files

```bash
git status                  # what did I change?
git diff                    # what exactly?
git checkout -- <file>      # throw away my changes to one file
git checkout -- .           # throw away ALL uncommitted changes
```

Then confirm it works before pushing:

```bash
npm test        # must print "All isolation tests passed" and "All build tests passed"
npm run build   # must print "Built N pages"
```

**Never push if `npm test` fails.** The CI runs the same tests and will refuse
to deploy anyway, so pushing only wastes time.

---

## 6. Running it locally

```bash
npm run dev
```

Opens at http://localhost:4321. Nothing needs installing first: the project has
zero npm dependencies on purpose.

Other commands:

| Command | Does |
|---|---|
| `npm run build` | Data to `dist/` |
| `npm run scrape` | Run every enabled source |
| `npm run scrape:one <id>` | Run one source |
| `npm run scrape:list` | List registered sources |
| `npm test` | Isolation and build tests |

---

## 7. Editing content without touching code

Most changes are data, not code.

| To change | Edit | Then |
|---|---|---|
| Homepage headline, hero clips | `data/curated/hero.json` | `npm run build` |
| Add or fix a benefit | `data/curated/benefits/<state>.json` | `npm run scrape:one curated-benefits` |
| Hero video files | Drop into `public/video/`, keep the same names | `npm run build` |

Then `git add -A`, `git commit -m "..."`, `git push`. Live in about 30 seconds.

Copy `data/curated/benefits/_template.json` to start a new state. Files starting
with `_` are ignored.

**The rule that matters:** only mark a record `"confidence": "verified"` if you
personally opened its `officialUrl` and confirmed it. A wrong figure here can
cost a Veteran a filing deadline.

---

## 8. Accounts and where things live

| Thing | Where | Notes |
|---|---|---|
| Source code and data | github.com/triggs2025/usvethub | Public repo, branch `main` |
| Live site | triggs2025.github.io/usvethub | GitHub Pages, built by Actions |
| Domain | usvethub.com at GoDaddy | Not yet pointed at GitHub |
| Local working copy | `C:\Users\triggs\usvethub` | |

**There are no secrets, API keys, or passwords anywhere in this project.** That
is deliberate. Nothing to leak and nothing to rotate. If a future source needs
an API key it goes in GitHub Actions secrets, never in a file.

### To point usvethub.com at the site

At GoDaddy, replace the A records for the apex with these four:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Add a CNAME record: `www` pointing to `triggs2025.github.io`.

Then in this repo, delete the two `SITE_BASE_URL` lines in
`.github/workflows/deploy.yml`. The build default is already the production
domain and will start shipping the `CNAME` file automatically.

---

## 9. What cannot break

Worth knowing so you do not go looking for problems that do not exist.

- **A scraper cannot break the website.** Different processes, different
  timelines. The site builds from committed data.
- **A scraper cannot corrupt another scraper.** Each writes only to its own
  file, named after itself.
- **Bad data cannot reach a page.** Every record passes a schema check first.
  Records that fail are dropped and reported.
- **A source site redesign cannot silently empty a page.** If a scraper suddenly
  finds far fewer records than before, the run is refused and the old data kept.
- **There is no database to corrupt and no server to compromise.**

Run `npm run test:isolation` to prove all of the above. It runs four
deliberately broken sources and checks that each is contained.

---

## 10. If you need to hand this to a developer

Point them at `CLAUDE.md` first, then `docs/SECURITY.md`. The whole site
generator is one file, `scripts/build-site.mjs`, and there are no frameworks to
learn. A competent web developer should be productive within an hour.
