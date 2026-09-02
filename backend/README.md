# The admin back end

The system where advertisers and public submissions are handled. It is a
separate application from usvethub.com on purpose, and the separation is the
security design rather than a tidiness preference.

Written to be followed at 11pm by someone who is not a developer, same as
`docs/RUNBOOK.md`.

---

## What it is, in one picture

```
  ADMIN WORKER                              PUBLIC SITE
  usvethub-admin                            usvethub.com
  ----------------------                    --------------------
  Cloudflare Workers + D1                   static HTML on GitHub Pages
  behind Cloudflare Access                  no server, no database, no login
  advertiser records                        nothing to attack
  submission queue
  audit log
          |
          |  YOU review, approve, and export a JSON file
          |  YOU commit it to the repo
          v
  git commit  ->  schema validation  ->  rebuild  ->  deploy
```

**The public site never talks to this database.** Not at page load, not ever.

That means if this Worker is completely compromised, the attacker has this
Worker and this database. They cannot change one word on usvethub.com, because
changing usvethub.com requires a git commit, and the record still has to pass
the same schema gate as everything else. The blast wall between scrapers is the
same idea applied to the whole platform.

## What is already done

- **D1 database `usvethub-admin`** exists on the Cloudflare account,
  `2d276019-e27a-42b6-bb18-125097073256`. Its own database, shared with nothing
  else on the account.
- **Schema applied.** Three tables: `sponsors`, `submissions`, `audit_log`.
- **Worker written and tested.** `npm run test:backend` checks that what the
  export produces passes the real published sponsor schema, using the same
  validator the scrape uses.

## What is left, and it needs you

### 1. Point the nameservers at Cloudflare  (DECIDED: admin.usvethub.com)

**Decided 2026-08-31.** Cloudflare will not take `admin.usvethub.com` as a zone
on its own: subdomain zones are an Enterprise feature, and the free plan refuses
anything but a root domain. So the whole domain moves.

The zone `usvethub.com` is already created on the account, on the Free plan, and
Cloudflare has assigned these nameservers:

```
ligia.ns.cloudflare.com
nero.ns.cloudflare.com
```

**DONE 2026-08-31.** The nameservers were changed at GoDaddy and confirmed live
at the registry within a minute. `ns39` and `ns40.domaincontrol.com` are gone.

Cloudflare's own activation check runs on its own schedule, usually one to two
hours, and the zone shows "Waiting for your registrar" until it completes. That
is a Cloudflare-side job, not something still owed at the registrar. The next
step waits on it.

Why this is safer than it sounds, checked rather than assumed:

| Checked | Result |
|---|---|
| MX records | **None.** No email is received at this domain, so there is no mail to break. |
| DNSSEC | **Off.** No DS record at the parent. This is the usual cause of a broken nameserver move, and it does not apply. |
| Apex `A` records | GoDaddy parking IPs. The only thing that changes hands is a parking page. |
| `_dmarc` TXT, `www`, `_domainconnect` | Found by Cloudflare's scan and already imported, so they carry over. |

Propagation is usually under an hour and Cloudflare emails you when the zone
goes active.

What the move also unlocks, beyond the admin system: the public site can finally
be cut over from `triggs2025.github.io` to `usvethub.com` (suggestion 34),
edge analytics with no third-party script (70), and the real security headers
GitHub Pages cannot send, including the `frame-ancestors` gap recorded in
`docs/SECURITY.md`.

### 2. Deploy it

```bash
npx wrangler deploy --config backend/wrangler.toml
```

Wrangler is already authorized on this machine as `tony.riggs2@gmail.com`. It
prints the URL it deployed to. Visit it and you should get
`403 forbidden` with a reason. **That is the correct result** before Access is
configured, and worth checking, because it proves the lock is on the door.

### 3. Access application  (DONE 2026-08-31)

Created and live. Nothing to do here.

| | |
|---|---|
| Application | `admin`, self-hosted |
| Destination | `admin.usvethub.com` |
| Policy | `USVetHub admin, named people only`, Allow |
| Rule | **Emails** is `tony.riggs2@gmail.com`, a named address rather than a whole email domain |
| Team domain | `tokencurb.cloudflareaccess.com` |

**On that team domain.** It is account-wide: Cloudflare gives you one per
account, and this one was named when Zero Trust was first set up for
token-curb. It cannot be renamed without breaking the token-curb applications,
which use it too, so it stays. Being off-brand is cosmetic. What matters is that
every Access application on this account is signed by **the same keys**, which
is exactly why the Worker checks the audience claim on every request. Without
that check, a valid login to token-curb would be a valid login to this.

To add someone later: Zero Trust, Access controls, Policies, open the policy and
add their address to the same **Emails** rule. Never switch it to *Emails ending
in*, which would admit an entire domain.

### 4. Worker configuration  (DONE 2026-08-31)

Both values are already in `backend/wrangler.toml`:

```toml
ACCESS_TEAM_DOMAIN = "tokencurb.cloudflareaccess.com"
ACCESS_AUD = "cfff81537894f5caf5da60ad496bfe4169130cfec2e8179eef0255b1113dfe01"
```

Neither is a credential, which is why they sit in a public repository rather
than in `wrangler secret put`. The AUD tag names *which* application a token was
minted for. It grants nothing on its own, because forging a token would take
Cloudflare's private signing key. Its job is the opposite of a password: the
Worker refuses any assertion whose `aud` is not this exact value.

**Anything that IS a secret goes in `npx wrangler secret put NAME`, never in a
file.** This repository is public.

### 5. Point the hostname at the Worker  (LAST STEP)

After `npx wrangler deploy --config backend/wrangler.toml`, add
`admin.usvethub.com` as a custom domain on the Worker: Workers & Pages,
`usvethub-admin`, Settings, Domains & Routes, Add custom domain. Cloudflare
creates the DNS record itself.

Then open https://admin.usvethub.com. Access should ask who you are, and
nothing else should be able to get in.

---

## Using it

### Adding an advertiser

1. Open the admin URL. Access asks who you are, then the form loads.
2. Fill it in and **Save as draft**. Validation runs on the server, not just in
   the browser, so a malformed URL or a hotlinked creative is refused whatever
   the form allowed.
3. Read `docs/ADVERTISING.md` against the advertiser. Put your name and the date
   in **Policy reviewed by**.
4. **Approve.** The button does not appear while anything is blocking it.
5. **Download approved as JSON**, save the file into
   `data/curated/sponsors/`, then:

```bash
npm run scrape:one curated-sponsors && npm run status
```

6. Look at what changed, then commit. The ad is live at the next build.
7. Once it is committed, use **Download and mark exported** so the record is
   locked. Editing an exported record is refused, because two versions of the
   same ad with no way to tell which one ran is how you lose an argument with an
   advertiser.

### The claims-representation rule

An advertiser selling help with VA claims cannot be approved without a VA
accreditation number **and** a date on which you personally checked it against
the VA Office of General Counsel accreditation search.

This is not a house style. Under 38 U.S.C. 5904 only an accredited attorney or
claims agent may charge a Veteran a fee at all, and only for work after VA has
decided the initial claim. An advertiser in that category who cannot produce a
number is offering to sell something they are not permitted to sell, to exactly
the people this site exists to protect. The Worker refuses the approval, the
export refuses to include it, and `npm test` fails if one reaches the site
anyway. Three locks on one door, on purpose.

---

## Security notes, so the decisions are not lost

- **No password, no session, no user table.** Identity is Cloudflare Access.
  There is nothing here to brute force.
- **The assertion is verified, not read.** `src/access.mjs` fetches the team's
  public keys, checks the RS256 signature, the audience, the issuer, and expiry.
  Reading the header without verifying it would make the header itself the
  password, and it would be a password written into every request log.
- **Fails closed.** If Access is unreachable, or the config is missing, every
  request is refused.
- **No dependencies.** Nothing in the Worker was written by anyone else.
- **Errors are not echoed.** A D1 error message can carry column names and query
  fragments, so it is logged and the caller gets `internal error`.
- **Submitter email addresses never leave this database.** They are not in the
  export, not in the submissions list the UI renders, and not in the repo. The
  public repo has a no-PII rule and a repo cannot forget.
- **The export drops internal fields** rather than relying on someone to
  remember: rates, notes, who approved it, and workflow status are not in the
  file that gets committed.
- **The Worker holds no GitHub token and no deploy key.** It cannot publish. A
  person commits, or nothing is published.
