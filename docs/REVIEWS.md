# Reviews and ratings

Design for letting Veterans rate and review the organizations listed here, with
every review approved before it publishes.

**Not built.** This needs the admin back end described in
[PLATFORM.md](PLATFORM.md). Written now because the decisions are far cheaper to
make before there is data attached to them.

---

## 1. What this is actually for

The stated goal is that a Veteran can tell which organizations are worth their
time. Ratings are one way to get there. They are not the only way, and on their
own they are the weakest of the three signals available:

| Signal | Can it be faked? | Effort to fake |
|---|---|---|
| Form 990 financial filings | Not realistically | Federal filing under penalty of perjury |
| VA accreditation status | No | It is a federal list |
| User star rating | **Yes, trivially** | A few friends, or fifty dollars |

That ordering should drive the design. Ratings are worth having, and they should
sit **underneath** the things that cannot be bought.

---

## 2. The risks, stated plainly

### Review fraud is the normal case, not the edge case

Any public rating system attached to money attracts manipulation. Here there are
two directions:

- **Astroturfing.** An organization solicits reviews from its own board,
  volunteers, and staff. This is easy, common, and usually not even perceived as
  cheating by the people doing it.
- **Attack reviews.** A rival, a disgruntled former employee, or someone with a
  grudge posts negatives. A small nonprofit with eleven reviews can be knocked
  down by three.

### Ranking is where fraud turns into harm

A rating shown as information is a mild problem when it is wrong. A rating that
**orders the list** is a serious one, because it decides who a Veteran contacts
first. The realistic bad outcome is not embarrassment. It is a Veteran in
crisis calling the organization that bought the most reviews instead of the one
two miles away that would have helped.

**So: do not sort by rating.** See section 4.

### Legal exposure

Publishing user statements about named organizations creates defamation risk.
In the US, Section 230 broadly protects a platform from liability for content
its users write, and moderating in good faith does not forfeit that protection.
That is the general position and it is a strong one, but it is not legal advice
and a lawyer should confirm it before launch, particularly because:

- We approve every review before publication, which is more editorial
  involvement than a typical platform has.
- Organizations will occasionally demand removal, and there should be a written
  process rather than an ad hoc decision each time.

### The moderation burden is the real cost

Every review needs a human decision. At ten reviews a week that is trivial. At
five hundred it is a job. Design for the volume to be throttled deliberately
rather than discovering the ceiling later.

---

## 3. What a review actually captures

Tony's instinct that recency matters is the strongest idea in the whole design,
and it should be captured explicitly rather than inferred from the post date.

| Field | Why |
|---|---|
| Overall rating, 1 to 5 | The headline number |
| **When did you last use them** | A review of a 2019 experience should not carry the weight of a 2026 one. This is asked, not guessed from the submission date |
| Did they actually help you | Yes / No / Partly. Often more informative than the star count |
| How long did it take to reach a person | Never / Days / Same day. The single most common complaint about Veteran services |
| Was anything charged | Yes / No, plus free text. **This is the fraud tripwire.** Any charge for claims help is worth investigating before the review publishes |
| Written review | Free text, moderated |
| Would you send another Veteran here | The clearest one-question summary |

**Deliberately not captured:** the reviewer's diagnosis, disability rating,
claim details, or anything about their medical or financial situation. That is
sensitive personal data, it is not needed to rate a service, and holding it
would create an obligation we should not take on.

---

## 4. Display and ranking rules

These are the rules that turn a rating system from a liability into something
useful.

1. **Default sort is never by rating.** Sort by location, then relevance. A
   Veteran looking for help wants what is near them and open, not what scores
   highest nationally.
2. **No score displays below a minimum of 5 reviews.** Show "not enough reviews
   yet" instead. A single five-star review is noise presented as signal, and a
   single one-star review can destroy a small organization unfairly.
3. **Weight by recency, using the reported date of use.** A review of an
   experience within the last year counts fully; older ones decay. State the
   weighting publicly so it cannot be read as a thumb on the scale.
4. **Objective signals rank above subjective ones on the card.** VA accreditation
   and the 990 program-expense ratio appear above the stars, because they cannot
   be bought.
5. **A paid placement never affects a score, a rank, or inclusion.** Already the
   rule for advertising; it applies identically here.
6. **Every organization gets a right of reply**, published alongside the review.
   Cheap to build, and it defuses most disputes before they become demands.
7. **Show the review count next to every score.** "4.8 from 6 reviews" and "4.8
   from 300 reviews" are not the same claim.

---

## 5. Moderation

Every review is a **proposal, not a publication**, exactly as with organization
submissions.

```
submitted -> queued -> human decision -> approved -> exported -> git -> built
```

The reviewer sees "submitted for review", never a live post. There is no
mechanism by which a stranger's text reaches the public site without a person
deciding it should.

### What to reject

- Anything naming a private individual. "The intake worker was rude" is fine.
  Naming them is not, and it is the fastest route to a real legal problem.
- Anything containing the reviewer's own medical or claim details, even
  voluntarily offered. Publishing it would harm them.
- Anything alleging criminal conduct. Do not publish, and do not adjudicate it.
  Point the reviewer at the VA Office of Inspector General and the state
  charity regulator, both of which can actually act.
- Obvious astroturfing: several reviews of one organization arriving together,
  from similar addresses, in similar language.

### What to escalate rather than simply publish

**Any review reporting a fee charged for claims assistance.** That is the
predatory pattern this whole site is built to counter. It should trigger a check
of the organization's VA accreditation status before anything publishes, and if
it holds up it is more useful as a warning on the listing than as one review
among many.

---

## 6. Who can review

The tension: requiring identity cuts fraud but also cuts participation, and this
audience is rightly wary of handing over personal data.

**Recommended:** email verification only, one review per organization per
address, no account required. Low friction, filters the laziest fraud, collects
almost nothing.

**Rejected: requiring proof of Veteran status.** It would mean either handling
DD-214s, which is sensitive data we should not hold, or paying a verification
service. It would exclude family members and caregivers, who are often the ones
dealing with these organizations. And it would not stop a determined
astroturfer, who is usually a genuine Veteran anyway.

The email address is PII and lives **only** in the admin database. It never
enters the public repository, and the published review carries a first name and
a rough location at most.

---

## 7. Where this sits on the site

Reviews attach to the curated directory: state agencies, VSOs, county service
offices, legal aid, and the organizations we have actually checked.

**They should NOT be opened on all 11,800 IRS-registered nonprofits at once.**
Most have never been contacted by anyone who would review them, an empty rating
on every listing makes the whole feature look dead, and the moderation load
would be unbounded. Start with the curated set, and let an organization become
reviewable once it has been verified.

---

## 8. Build order

1. Data model and schema for reviews. Same validation gate as everything else.
2. Submission form, writing to the admin queue. Nothing public.
3. Moderation queue with approve, reject, and escalate.
4. Export approved reviews to JSON, commit, build.
5. Display on organization cards, with the rules in section 4.
6. Right of reply.
7. Aggregate scores, **only once there is enough volume for a score to mean
   anything**, which realistically means several hundred reviews.

Steps 1 to 4 are the whole system. Steps 5 to 7 are presentation and can wait
until real reviews exist.

---

## 9. Open questions for Tony

1. **Is the moderation load acceptable?** Every review needs a human decision.
   Who does it, and what is the target turnaround?
2. **What happens when an organization demands removal of a truthful negative
   review?** Decide the policy now, in writing, rather than under pressure.
3. **Do reviews open on the IRS-registered nonprofits eventually, or only ever
   on the curated directory?** Section 7 recommends the latter to start.
4. **Is a lawyer reviewing this before launch?** Recommended. Section 230 is a
   strong protection and the risk here is low, but "strong protection" and
   "confirmed by someone who will stand behind it" are different things.
