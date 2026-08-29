/**
 * "Paying for help with a VA claim" page.
 *
 * Tony asked for this because he personally knows Veterans who paid for an
 * initial claim, which is not allowed. That is the whole reason the page exists:
 * the rule is clear, it is federal law, and almost nobody knows it.
 *
 * Every figure and rule here is quoted from 38 CFR 14.636 or from VA's own
 * Office of General Counsel accreditation pages, both read directly. Nothing on
 * this page is inferred.
 */
import { html, esc, escUrl } from '../lib/html.mjs';

export const payingForHelpBody = html`
  <h1>Paying for help with a VA claim</h1>
  <p class="lede">Some help is free by law. Some help can legally be charged for,
  but only in specific circumstances. And some charges are simply not allowed at
  all. A lot of Veterans have paid money they never owed, so here is the actual
  rule.</p>

  <section class="warn">
    <h2>The short version</h2>
    <p><strong>Nobody may charge you to file your first claim.</strong> Not a
    lawyer, not a claims agent, not a consultant, not anybody. Charging for an
    initial claim is prohibited under federal law regardless of who is asking.</p>
    <p>After VA has issued a decision, an <strong>accredited</strong> attorney or
    claims agent may charge you to help with an appeal. That part is legal and
    often genuinely worth it.</p>
  </section>

  <div class="section-head"><h2>Always free, no exceptions</h2></div>
  <p>Accredited representatives at Veterans Service Organizations work on your
  claims <strong>for free</strong>. Not discounted. Free. That includes the VFW,
  the American Legion, DAV, and your county or state Veteran service officer.</p>
  <p>They are trained, accredited by VA, and they do this all day. For most
  Veterans filing a first claim, this is the right answer and it costs nothing.</p>

  <div class="section-head"><h2>When someone can legally charge you</h2></div>
  <p>Under <strong>38 CFR 14.636</strong>, an accredited attorney or claims agent
  may charge a fee only for representation provided <strong>after VA has issued
  notice of a decision</strong> on your claim.</p>
  <p>In plain terms: you get denied, or you get a rating you believe is too low,
  and now you want to fight it. At that point paying an accredited attorney is
  lawful, and for a complicated appeal it can be a sensible thing to do.</p>

  <h3>What a fee should look like</h3>
  <ul class="plain">
    <li>A fee of <strong>20 percent or less</strong> of your past-due benefits is
    <em>presumed reasonable</em> under the regulation.</li>
    <li>A fee <strong>above 33 and one third percent</strong> of past-due benefits
    is <em>presumed unreasonable</em>.</li>
    <li>Anything between those two is neither presumed one way nor the other.</li>
  </ul>
  <p>A presumption is not a hard cap, but a fee above a third of your back pay is
  one VA itself treats as suspect. Treat it the same way.</p>

  <div class="section-head"><h2>What is not allowed</h2></div>
  <ul class="plain">
    <li><strong>Charging for an initial claim.</strong> Before VA has decided
    anything, no fee is permitted from anyone.</li>
    <li><strong>Charging without VA accreditation.</strong> Only accredited
    attorneys and claims agents may receive fees for claims work at all.</li>
    <li><strong>Charging for a VSO representative's help.</strong> That help is
    free by law.</li>
  </ul>
  <p>Companies that call themselves "claim consultants" or "coaches" and take a
  percentage of your back pay for an initial claim are describing something they
  are not permitted to sell. Some of them are careful never to use the word
  "represent" precisely because of this rule.</p>

  <div class="section-head"><h2>Check before you pay</h2></div>
  <p>VA publishes a searchable list of every accredited attorney, claims agent,
  and VSO representative. It takes about a minute.</p>
  <p class="hero-actions">
    <a class="button" href="${escUrl('https://www.va.gov/ogc/apps/accreditation/index.asp')}" rel="noopener">
      Search VA's accreditation list
    </a>
  </p>
  <p>If the person asking for money is not on that list, they cannot lawfully
  charge you for claims work. That is not a judgement call, it is the rule.</p>

  <div class="section-head"><h2>If you have already paid</h2></div>
  <p>You are not the first, and it is worth reporting even if you do not get the
  money back. Reports are how VA finds the people doing this at scale.</p>
  <ul class="plain">
    <li><strong>Report to the FTC</strong> at
    <a href="${escUrl('https://reportfraud.ftc.gov/')}" rel="noopener">reportfraud.ftc.gov</a>.
    VA specifically recommends this route because it notifies the VA
    accreditation program and reaches other federal and state authorities at the
    same time.</li>
    <li><strong>Or complain directly to VA's Office of General Counsel</strong>
    using VA Form 3288, mailed to Office of the General Counsel (022D),
    Department of Veterans Affairs, 810 Vermont Avenue NW, Washington DC 20420.
    Questions about filing: <a href="tel:2024617699">202-461-7699</a>.</li>
    <li><strong>If it was an attorney</strong>, your state bar also takes
    complaints, separately from VA.</li>
  </ul>

  <div class="section-head"><h2>Where to get free help right now</h2></div>
  <p>Your state Veteran agency can connect you with an accredited service officer
  in your county, at no cost.</p>
  <p class="hero-actions">
    <a class="button" href="${escUrl('/free-help/')}">Free help</a>
    <a class="button button-ghost" href="${escUrl('/states/')}">Find your state agency</a>
  </p>

  <p class="source">
    Sources read directly: 38 CFR 14.636 on the eCFR, and the VA Office of
    General Counsel accreditation and complaints pages. This page explains the
    rules in plain language. It is not legal advice, and USVetHub is not your
    representative.
  </p>
`;

export const payingForHelpMeta = {
  title: 'Paying for help with a VA claim',
  path: '/free-help/paying-for-help/',
  description:
    'Nobody may charge you to file your first VA claim. Here is what is free by law, '
    + 'when an accredited attorney may legally charge, what a reasonable fee looks like, '
    + 'and how to report someone who charged you when they should not have.',
};
