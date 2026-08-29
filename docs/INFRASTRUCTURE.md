# Infrastructure: what we have and what to use it for

Tony already pays for or holds four things. This maps each to the jobs the
platform actually needs, and says plainly which ones to avoid for which jobs.

---

## The jobs to be done

1. Serve the public site. **Solved today** by GitHub Pages.
2. Analytics: how many visitors, and where they go.
3. Admin back end: logins, database, advertiser records, moderation queue.
4. Public submission forms.
5. Advertiser pipeline: who we are selling to, invoices, renewals.
6. Newsletter.
7. Video and media hosting, if the hero grows past what Pages should serve.

---

## Recommendation, shortest path first

| Job | Use | Why |
|---|---|---|
| Public site | **GitHub Pages** (no change) | Working, free, zero attack surface |
| Analytics + security headers | **Cloudflare in front of Pages** | Free, no migration, see below |
| Admin back end + submissions | **Plesk** | Already owned and maintained. Proven pattern from AZVLC |
| Advertiser pipeline + newsletter | **GoHighLevel** | Already paid for, and this is literally what it is for |
| Video, later | **Cloudflare R2**, or Oracle egress | Only if the hero outgrows the 12 MB budget |
| Oracle Cloud | **Nothing critical.** See the warning | |

---

## 1. Cloudflare in front of GitHub Pages · do this first

This is the highest-value, lowest-risk move available, and it does **not**
require moving hosting.

Point `usvethub.com` DNS at Cloudflare (free plan), and have Cloudflare proxy
through to GitHub Pages. The site keeps being built and deployed exactly as it
is now. What changes:

- **Cloudflare Web Analytics.** Visitor counts and per-page numbers, measured at
  the edge. No cookies, no third-party script on the page, no CSP change, no
  consent banner. Answers the dashboard requirement without tracking anybody.
- **Real HTTP response headers.** This closes the one security gap currently
  written down as accepted: `frame-ancestors` cannot work in a meta tag, and
  Pages cannot send headers. Cloudflare can. It also lets us send
  `X-Content-Type-Options` and a proper `Referrer-Policy`.
- **DDoS protection and caching** in front of the origin.

Cost: nothing on the free plan. Risk: low, and reversible by pointing DNS back.

Note when setting up: use **Full (strict)** SSL mode, and let Pages keep its own
certificate. This also replaces the GoDaddy DNS step in the runbook, since
Cloudflare becomes the nameserver.

---

## 2. Plesk · the admin back end

**Recommended for the back end**, ahead of the alternatives, for one reason
that outweighs the others: it already exists and is already being maintained.

- PHP and MySQL are there. AZVLC already runs a hardened server-side proxy on
  Plesk (`gh-proxy.php`), so the pattern is proven and Tony has done it before.
- A `admin.usvethub.com` subdomain keeps it off the public site, which is the
  whole architectural point in [PLATFORM.md](PLATFORM.md).
- The public site never talks to it. Approved records are exported as JSON,
  committed to git, and built. A compromise of Plesk cannot deface usvethub.com.

**The real caveat, stated honestly:** Plesk hosts other client sites. Shared
hosting means a compromise anywhere on that box is a compromise near everything
on it. So:

- Keep the admin database credentials in a config file outside the web root, the
  same way AZVLC's `config.php` is handled.
- Never put PII in a directory that any site's web root can serve.
- Keep Plesk and PHP patched. On shared hosting this is the whole game.

If that shared-tenancy risk feels wrong for holding submitter contact details,
the alternative is Cloudflare Workers plus D1, where there is no server to patch
at all. More new learning, less ongoing exposure.

---

## 3. GoHighLevel · advertiser pipeline and newsletter

Genuinely well matched, and already paid for. Use it for the parts of the ad
business that are **not** the website:

- Advertiser CRM: leads, pipeline, follow-ups, renewals.
- Invoicing and payment collection.
- The newsletter, which [ADVERTISING.md](ADVERTISING.md) argues should come
  before display advertising because sponsorship pays far more per reader.
- Landing pages for advertiser enquiries.

**Do not use it to serve anything on usvethub.com.** Embedding a GHL form or
tracking script would put third-party JavaScript on the public site, which is
exactly what the CSP exists to prevent. Link out to a GHL page instead of
embedding one.

That split is clean: GHL runs the business, the static site stays sealed.

---

## 4. Oracle Cloud Always Free · do not depend on it

The offer is real: currently 2 ARM cores and 12 GB RAM, 2 small AMD instances,
200 GB block storage, and 10 TB/month of egress. That is a genuine server for no
money.

**It should not hold anything whose loss would hurt.** Not from vendor
prejudice, from what happened this year:

- In **June 2026 Oracle halved the Always Free ARM allowance** from 4 cores and
  24 GB to 2 cores and 12 GB. There was no blog post and no customer
  notification. The documentation was simply edited, and users found out when
  their instances stopped.
- Oracle then **terminated instances that exceeded the new limits from 18 August
  2026**, which was eleven days ago.
- Free-tier ARM capacity is frequently unavailable in popular regions, including
  Phoenix. "Out of capacity" on launch is normal, not a fault.
- Free accounts have effectively no support recourse.

Beyond the vendor risk there is an ownership cost that Workers and Pages do not
have: **a VM is yours to patch.** OS updates, firewall, SSH hardening, fail2ban,
TLS renewal, backups, monitoring. Neglecting any of those is the most common way
a small project gets compromised, and an unmaintained free VM is exactly the
kind of thing that gets forgotten and then owned.

### Where it is genuinely useful

- **A scratch or staging box.** Somewhere to try things with nothing at stake.
- **Batch jobs**, if the scrapers ever outgrow GitHub Actions. They have not.
- **Bulk media egress.** 10 TB a month is far more than Pages will tolerate, so
  it is a candidate if the video library grows a lot. Cloudflare R2 is the
  better option unless cost becomes the deciding factor.

**Verdict: keep the account, use it for experiments, and put nothing on it that
would hurt to lose overnight.**

---

## 5. GitHub private repos

The public repo is correct for this project: no secrets, no PII, all data is
public government information.

The place a **private** repo becomes necessary is the moment submissions start,
for exactly the reason AZVLC needed one. Submitter contact details are PII and
must never sit in a repository that GitHub Pages publishes. If any submission
data is ever version-controlled rather than living only in the admin database,
it goes in a separate private repo that Pages never touches.

---

## Suggested order

1. **Cloudflare in front of Pages.** Cheapest, fastest, and it delivers the
   analytics dashboard plus closes the header gap. Do this before anything else.
2. Build the public sections that need no server: menu, discounts, free help,
   ad slots.
3. Sell the first advertisers manually, tracking them in GoHighLevel.
4. Only then build the admin back end on Plesk, once there are real advertisers
   whose actual needs can shape it.

---

## GoHighLevel sub-account · CREATED 2026-08-29

| Field | Value |
|---|---|
| Business name | USVetHub |
| Sub-account ID | `0IT3ZzlAbAs2RBwQZfD6` |
| Website | https://usvethub.com |
| Mailing address | PO Box 93621, Phoenix, AZ 85070 |
| Phone | 602-524-5299 |
| Time zone | GMT-07:00 America/Phoenix (MST) |
| Snapshot | Blank |

The address is confirmed: PO Box 93621 already appears on the AZ Veterans and
AI Nymph sub-accounts, which resolved the earlier ambiguity about whether 93621
was a box number or a street number.

**Created from a Blank snapshot deliberately.** Importing one of the 122
industry templates would have loaded workflows, funnels, and automations nobody
designed for this property, and some of those templates send email.

### Two settings left at their defaults, worth a second look

1. **Account type is "This is my client's account"**, the form default.
   USVetHub is Tony's own property, so "This is my own account" may be more
   accurate. It was left alone because that toggle affects agency rebilling, and
   guessing at a billing setting is worse than leaving the default. One click to
   change under the sub-account's settings.
2. **Business Niche was left blank.** Media or Publishing is the closest fit if
   it matters for reporting.

**Keep it a separate sub-account from NSC Shirts.** Different business, different
audience, and a shared list would eventually mean sending Veteran benefit email
to apparel customers.

### What this sub-account is for

Per [PLATFORM.md](PLATFORM.md), GoHighLevel runs the business and never the
website.

1. **Advertiser pipeline.** Suggested stages: Prospect, Contacted, Proposal
   sent, Policy check, Live, Renewal due, Lapsed.
   *Policy check* is a real stage, not a formality: no ad runs until a named
   human has checked it against `docs/ADVERTISING.md`, and the sponsor schema
   requires that name before the record will validate.
2. **Invoicing and payment** for placements.
3. **The newsletter**, which [ADVERTISING.md](ADVERTISING.md) argues should come
   before display advertising, since sponsorship pays far more per reader.
4. **Advertiser enquiry landing page**, hosted on GHL and linked to from the
   site.

### The rule that must not be broken

**Never embed a GoHighLevel form, chat widget, or tracking script on
usvethub.com.** It would put third-party JavaScript on the public site, which
the Content Security Policy exists to prevent and would refuse anyway.

Link out to a GHL-hosted page instead. That keeps the static site sealed while
GHL handles anything that needs to capture data.

### Custom fields worth creating for advertisers

These mirror the sponsor schema, so a signed advertiser can be turned into a
record without a second round of questions:

`advertiser_name`, `slot` (jurisdiction / discounts / organizations /
free-help), `jurisdiction` (state code, if buying a state page), `headline`
(90 characters), `body` (300 characters), `cta_label`, `destination_url`,
`creative_file`, `flight_start`, `flight_end`, `policy_reviewed_by`.
