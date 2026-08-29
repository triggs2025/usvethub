# Platform plan

Tony's list, turned into an architecture and an order of work.

The list: where advertisers go, what the menu should be, discounts split
national and local, nonprofits searchable by what they do, free services like
legal and tax help, an advertiser back end we can sell into, an analytics
dashboard, and letting people submit and edit their own organizations.

---

## 1. The fork in the road, stated plainly

Everything on that list divides cleanly in two.

**Needs no server.** Ad placements, discounts, nonprofit directory, free
services, the whole menu restructure. All of it is data rendered to static
pages, exactly like the benefits pages today.

**Needs a server.** Advertiser self-service, an analytics dashboard, and public
submissions. These need authentication, a database, and forms that accept input
from strangers.

That second group is where the risk lives. Today there is no login to brute
force, no database to inject into, no session to steal, and no form to abuse,
because none of those things exist. A back end reintroduces every one of them.

**The answer is not to refuse the back end. It is to keep it off the public
site.**

---

## 2. Recommended architecture: two systems, one direction of flow

```
  ADMIN SYSTEM                          PUBLIC SITE
  admin.usvethub.com                    usvethub.com
  ------------------                    ------------------
  logins, database, forms               static HTML, no server
  advertiser self-service               no database, no login
  submission queue                      nothing to attack
  analytics dashboard
          |
          |  human reviews and approves
          |  approved records exported as JSON
          v
  git commit  ->  rebuild  ->  deploy
```

**The public site never talks to the database.** Not at page load, not ever. It
is built from JSON that a person approved and committed to git.

Why this matters more than it sounds: if the admin system is fully compromised,
the attacker gets the admin system. They cannot deface usvethub.com, because
changing the public site requires a git commit and a rebuild, and the data
passes the same schema validation everything else does. The blast wall we built
between scrapers is the same idea applied to the whole platform.

It also means the public site cannot be taken down by the admin system going
down, being migrated, or being rewritten later.

### What that costs

An admin system is a real application that needs maintaining, patching, and
backing up. It is the first part of this project that can genuinely be hacked.
It should be small, boring, and built with as little custom code as possible.

### Where it should live

Cloudflare Workers plus D1 is the strongest fit, and it argues for moving the
public site to Cloudflare Pages at the same time:

- **Analytics with no third-party script and no cookies.** Cloudflare Web
  Analytics is measured at the edge, so the dashboard requirement is solved
  without adding a tracker to the site or touching the CSP.
- **R2 for video**, which removes the GitHub Pages bandwidth ceiling that the
  12 MB build budget currently guards against.
- **Real HTTP headers**, which closes the `frame-ancestors` gap that GitHub
  Pages cannot.
- One vendor for site, back end, database, media, and analytics.

Staying on GitHub Pages is also viable. The admin system just lives elsewhere
and analytics needs a separate answer.

---

## 3. Menu and information architecture

Five items. More than five and people stop reading the nav.

| Nav item | Contains | Why it earns a slot |
|---|---|---|
| **Benefits** | State benefits by jurisdiction, plus federal | The core of the site. Highest search intent |
| **Discounts** | National chains and local offers | Highest traffic potential of anything here. People search this constantly |
| **Organizations** | Nonprofits, VSOs, agencies, filterable by what they do | The link hub. Already built |
| **Free help** | Legal aid, tax prep, claims assistance, financial counselling | Ties directly to the never-pay-for-a-claim message. Strong trust signal |
| **About** | Who we are, how we source, advertising policy | Credibility, and legally useful |

**Deliberately not included:**

- *Resources.* Everything on this site is a resource, so it labels nothing. It
  becomes the drawer where things go to be lost.
- *Good deals.* Same idea as Discounts. One name, not two.

### Discounts, broken down

Two axes, because people arrive from both directions.

- **By reach:** National (works anywhere: home improvement chains, carriers,
  restaurant groups) and Local (a barber in Yuma). National is easier to verify
  and maintain. Local is what makes the site irreplaceable.
- **By category:** Retail, food and dining, travel, automotive, home services,
  fitness, entertainment, technology, professional services.

**Three warnings on discounts, because this is the most fragile data on the
site:**

1. **It rots faster than anything else.** A state benefit changes with
   legislation, a discount changes when a regional manager decides it does.
   These records need a shorter staleness window than the 120 days benefits use.
2. **It is where affiliate revenue lives**, which is a conflict of interest. If
   a listing pays us, it must say so, and paying must never affect ranking or
   inclusion. Same rule as advertising.
3. **Verification is the whole product.** A directory of discounts that do not
   work is worse than no directory. Better to publish 200 confirmed offers than
   2,000 scraped ones.

### Organizations, filterable

The filter already exists on the organizations page. Extend the facets to what
people actually search for: community support, health care, financial
assistance, housing, employment, legal, education, family and survivors,
crisis, recreation.

### Free help

Worth separating from Organizations even though it overlaps, because the intent
is different. Someone browsing organizations is exploring; someone looking for
free legal help needs it today. It also puts the site's strongest trust message
in the navigation: **accredited claims help is free, and anyone charging you for
it is not acting in your interest.**

---

## 4. Where the advertisers go

Four placements, in the order they should be built.

| Placement | Where | Why it works |
|---|---|---|
| **Sponsored listing** | Inside a directory, marked, never re-ranked | Highest value to the advertiser and least intrusive to the reader. A Veteran-owned business paying to stand out in the discounts directory is genuinely useful content |
| **State page sponsor** | One slot per jurisdiction page | Sells geographically, which is what local advertisers want. 56 inventory slots that do not compete with each other |
| **Newsletter sponsor** | Email, not the site | Pays far more per reader than display, and needs no site changes at all |
| **Leaderboard** | Below the fold on category pages | Conventional display. Lowest value, build last, if at all |

**No slot above the fold on the homepage.** The hero is the brand, and putting
an ad on it makes the site look like everything else in this category.

All of it direct-sold and first-party per [ADVERTISING.md](ADVERTISING.md): an
image and a link, hosted by us, no third-party ad script.

---

## 5. Submissions and editing

The requirement is that organizations can submit and edit themselves. The risk
is that a form open to strangers is the most attacked thing on any website.

**Every submission is a proposal, not a publication.**

1. Someone submits through the admin system. Nothing is published.
2. It lands in a moderation queue.
3. A human approves it.
4. On approval it is exported as JSON, validated against the same schema as
   everything else, committed to git, and deployed.

Between step 1 and step 4 there is a person. That single fact defeats the entire
category of attacks where someone submits a malicious listing and it appears on
the site automatically. It also protects the thing this project actually sells,
which is that entries are checked.

**Contact details in submissions are PII and must never touch the public
repository.** They live only in the admin database. This is the AZVLC lesson
restated: a private repo does not make a published site private.

Editing an existing listing works the same way. A claimed listing means the
claimant can propose changes, not push them.

---

## 6. Analytics

What Tony asked for: how many people visit, and where they go.

**Cloudflare Web Analytics** if we move hosting. Measured at the edge, no
cookies, no third-party script, no CSP change, no consent banner, and nothing
that can leak a visitor's identity because it never collects one.

If we stay on GitHub Pages, the honest options are a self-hosted Plausible or
Umami instance, or accepting a small first-party script. **Not Google
Analytics.** It would mean a third-party tracker on a site read by Veterans
researching disabilities and mental health, plus a consent banner, plus a CSP
exception. The reputational cost is real and the data is not better.

Advertisers will ask for numbers. Edge analytics gives real ones without
tracking anybody.

---

## 7. Suggested order

**Now, no server needed:**

1. Menu restructure to the five items.
2. Discounts as a new record type, seeded with verified national offers.
3. Free help as a record type.
4. Ad placement slots, rendering nothing until a sponsor record exists.

That gets the site to its full public shape and gives something to sell.

**Then, once there is something to sell:**

5. Decide the hosting question in section 2.
6. Analytics, which is the smallest piece and answers the advertiser question.
7. Admin system: login, sponsor records, moderation queue.
8. Public submission form feeding that queue.

**Build the ad slots before the ad back end.** A spreadsheet and a JSON file can
run the first ten advertisers perfectly well. Do not build self-service software
for customers who do not exist yet.

---

## 8. Robust without cluttered

These pull against each other, and the tension worsens with every section
added. The rule that resolves it: **depth lives behind the surface, never on
it.**

- **Five nav items, permanently.** New sections become children of an existing
  one, not a sixth item. If something genuinely cannot fit under one of the
  five, that is a signal the five are wrong, not that six is fine.
- **One primary action per page.** A state page is for finding your benefits.
  Everything else on it is secondary and should look secondary.
- **Progressive disclosure.** The benefit cards already do this: plain summary
  visible, eligibility and detail collapsed behind a toggle. Someone scanning
  gets the answer, someone filing gets the fine print, and neither is punished
  for being the other. Keep applying that pattern instead of adding pages.
- **Filters over sub-navigation.** The organizations page uses one search box
  and a row of chips rather than eleven sub-pages. That scales to thousands of
  records without growing the menu by a single item.
- **Empty states are content.** A category with nothing in it says so plainly.
  Hiding it would make the site look complete while leaving a Veteran to guess
  whether we ever checked.

## 9. Mobile is the primary case, not the fallback

The audience reads this on a phone, frequently in a waiting room or a parking
lot, sometimes on a limited data plan, and often over 50. The desktop layout is
the adaptation, not the other way round.

Currently honoured, and worth defending as sections are added:

- 16px minimum body text and generous line height. Never shrink type to make
  something fit; cut the something instead.
- Full-width tap targets on cards and buttons, comfortably above the 44px floor.
- Single column below 600px. The hero band stacks rather than shrinking three
  clips into 120px slivers.
- The crisis line is the first thing on every page at every width.
- Video is muted, poster-first, and under a hard weight budget, because autoplay
  on cellular costs the reader money.

**Test every new section at 375px before calling it done.** That is the width of
the phone a large share of readers actually own.

## 10. Mobile app, not yet

Tony's idea, parked deliberately.

The right first version is a **Progressive Web App**, which is exactly what he
described: installed from the website itself, no app store, no review queue, no
developer account fees, and one codebase rather than three. Tap "Add to home
screen" and it behaves like an app.

What it would genuinely add beyond the current site:

- **Offline access** to your own state's benefits and the crisis numbers. That
  is the real argument. A Veteran with no signal still has the phone number they
  need.
- A home-screen icon, which drives return visits far more than a bookmark does.

What it would cost: a service worker, which is more JavaScript than the site
runs today, and a cache invalidation problem to get right so nobody is served a
benefit figure from six months ago.

A native app in the app stores is a separate and much larger decision. It only
makes sense if we need something a PWA cannot do, such as push notifications on
iOS. Not now.

**Not built. Revisit once the public sections in section 7 are done and there is
traffic worth retaining.**
