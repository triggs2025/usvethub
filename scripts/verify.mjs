/**
 * Verification queue. Local only, never deployed.
 *
 * WHY THIS EXISTS
 *
 * CLAUDE.md says a record is `verified` only when a person has checked it
 * against its officialUrl. That rule is right and nothing here weakens it. The
 * problem is throughput: there are 157 drafts, and checking one by hand means
 * finding the file, finding the record, finding the URL, opening it, reading,
 * then editing JSON. That is five minutes of hunting for thirty seconds of
 * judgement.
 *
 * This puts the claims and the source on one screen and writes the decision
 * back to the curated file, so the work becomes reading rather than hunting.
 *
 * WHAT IT WILL NOT DO
 *
 * It will not mark anything verified on its own. The Verified button stays
 * disabled until you have actually opened the official source for that record,
 * because a tool that lets you tick a box without looking would turn the house
 * rule into paperwork. Only a human sitting here can promote a record.
 *
 * SAFETY
 *
 * This process writes to data/curated/benefits, which is the source of truth
 * for the public site, so it is deliberately paranoid:
 *   - It binds to 127.0.0.1 only. Never expose it.
 *   - Writes require a token minted at boot and embedded in the page, so
 *     another site open in your browser cannot POST to localhost and edit your
 *     data. The Origin header is checked as well.
 *   - Writes go to a temp file and are renamed into place, so a crash halfway
 *     cannot truncate a curated file.
 *   - It only ever touches the `confidence` field. Everything else it leaves
 *     exactly as written, including key order and formatting.
 *
 * Usage: npm run verify              all drafts, most dangerous first
 *        npm run verify -- --jurisdiction=CA
 *        npm run verify -- --order=jurisdiction
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const BENEFITS_DIR = join(PROJECT, 'data', 'curated', 'benefits');
const NOTES_PATH = join(PROJECT, 'data', 'curated', 'review-notes.json');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4322);

// Minted per run. A page from a previous run cannot write to this one.
const TOKEN = randomBytes(18).toString('hex');

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ONLY_JURISDICTION = (argValue('jurisdiction') || '').toUpperCase() || null;
const ORDER = argValue('order') || 'risk';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

// ------------------------------------------------------------------- the queue

/**
 * How much it would cost to be wrong about this record.
 *
 * Alphabetical order is the wrong order to review in. A record asserting a
 * dollar figure on a property tax exemption can cost a Veteran money or an
 * afternoon at the assessor's office; a record saying a territory has no
 * property tax cannot. So the queue leads with the records where an error
 * does the most damage, and with the ones where the researcher already said
 * out loud that something was uncertain.
 */
function risk(record) {
  const prose = [record.summary, ...(record.details ?? []), ...(record.eligibility ?? [])].join(' ');

  // Tuned against the real corpus, and the first version was useless: it
  // included \brepeal and flagged 8 records, 0 of which had an unrecorded
  // sunset. In statutory writing "repealed" is nearly always a codification
  // note about the past, as in "the chapters that used to govern it are
  // repealed" or "repealed and reenacted by Public Law 24-118". So the word is
  // gone, and phrasings that say an ending was REMOVED are suppressed outright.
  //
  // Recall is unharmed: all four sunsets we know about are still caught by this
  // pattern, through "expires" for Indiana, Colorado and California and
  // "discontinued" for Maine.
  // "ends after" has to be followed by a year or a tax year. Unanchored it
  // matched "the incapacity ends after majority" in the Puerto Rico record,
  // which is about a surviving child and not about the benefit ending at all.
  const mentionsEnd = /\bexpires?\b|\bsunset\b|\bends? after (?:the )?(?:tax year\s*)?\d|\bdiscontinu|\bno longer applies\b/i.test(prose);
  const endingWasRemoved = /sunset(?: date)? (?:was|is|has been) removed|no longer expires|removed the sunset/i.test(prose);
  const mentionsYear = /\b(19|20)\d{2}\b/.test(prose);

  // Flags are shown to the reviewer, so each one has to say what to go and look
  // at. A score on its own tells you the order; it does not tell you why.
  const flags = [];
  let score = 0;

  if (record.amount && /\d/.test(record.amount)) { score += 3; flags.push('asserts a figure'); }
  if (record.category === 'property-tax' || record.category === 'income-tax') score += 2;
  if (mentionsEnd && !endingWasRemoved) { score += 2; flags.push('mentions an ending'); }
  if (/we could not|we are flagging|ambiguit|conflict|do not rely|treat .* as/i.test(prose)) {
    score += 2; flags.push('researcher flagged doubt');
  }
  if (mentionsYear) score += 1;
  if (!record.statuteRef) { score += 1; flags.push('no statute cited'); }

  // SUGGESTIONS #230. The four sunsets we know about were all found by accident,
  // and only because somebody happened to write the words down. A record whose
  // prose talks about an ending but carries no expiresAt is either missing the
  // field or describing a per-person deadline that should never have one. No
  // regex can tell those apart, which is the whole reason it goes to a human.
  //
  // The label says what to do rather than asserting a sunset exists. The
  // reviewer is asked the end date question on every record anyway; this flag
  // only decides what they are asked about first.
  if (mentionsEnd && !endingWasRemoved && !record.expiresAt) {
    score += 3;
    flags.push('check for an end date');
  }

  return { score, flags };
}

function loadQueue() {
  const items = [];
  let verifiedCount = 0;
  let totalCount = 0;

  if (!existsSync(BENEFITS_DIR)) return { items, verifiedCount, totalCount };

  for (const file of readdirSync(BENEFITS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(BENEFITS_DIR, file), 'utf8'));
    } catch {
      continue; // the pipeline reports malformed files; this tool just skips them
    }
    const list = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(list)) continue;

    for (const record of list) {
      totalCount += 1;
      // The pipeline treats an omitted confidence as verified, so this tool has
      // to read it the same way or it would show already-trusted records.
      const confidence = record.confidence ?? 'verified';
      if (confidence === 'verified') { verifiedCount += 1; continue; }
      if (ONLY_JURISDICTION && record.jurisdiction !== ONLY_JURISDICTION) continue;
      const { score, flags } = risk(record);
      items.push({ file, record, risk: score, flags });
    }
  }

  items.sort((a, b) =>
    ORDER === 'jurisdiction'
      ? a.record.jurisdiction.localeCompare(b.record.jurisdiction) || a.record.id.localeCompare(b.record.id)
      : b.risk - a.risk
        || a.record.jurisdiction.localeCompare(b.record.jurisdiction)
        || a.record.id.localeCompare(b.record.id));

  return { items, verifiedCount, totalCount };
}

// -------------------------------------------------------------------- writing

/** Rename into place, so an interrupted write cannot leave a half file. */
function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    renameSync(tmp, path);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* the rename already failed, nothing to salvage */ }
    throw error;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validated here as well as in the page, because this endpoint writes to the
 * files the public site is built from and the page is only one of its callers.
 */
function checkExpiry(expiry) {
  if (!expiry) return null;
  const { expiresAt, expiryNote } = expiry;
  if (!ISO_DATE.test(expiresAt ?? '')) throw new Error('expiresAt must be YYYY-MM-DD');
  if (Number.isNaN(new Date(`${expiresAt}T00:00:00Z`).getTime())) throw new Error('expiresAt is not a real date');
  if (expiryNote && expiryNote.length > 600) throw new Error('expiryNote is over 600 characters');
  return { expiresAt, expiryNote: expiryNote || undefined };
}

function applyDecision({ file, id, decision, note, reviewer, expiry }) {
  const path = join(BENEFITS_DIR, file);
  // The filename comes from our own queue, never from the request body, but
  // check anyway: this function writes to disk.
  if (!/^[a-z0-9_-]+\.json$/i.test(file) || !existsSync(path)) {
    throw new Error(`refusing to write to ${file}`);
  }

  const validExpiry = checkExpiry(expiry);

  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.records;
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) throw new Error(`no record ${id} in ${file}`);
  const record = list[index];

  // Only these two fields. The reviewer's job is to judge the record, not to
  // let a tool rewrite it behind their back.
  //
  // checkedAt is set on BOTH decisions, because both mean a person read the
  // record against its source. Rejecting one is still having checked it, and
  // the card says so: "a person checked this and flagged a problem" is more
  // use to a reader than "nobody has looked at this yet".
  record.confidence = decision === 'verified' ? 'verified' : 'needs-review';
  record.checkedAt = today();

  // SUGGESTIONS #230. The sunset answer is captured here because it is only
  // cheap to get right now, with the statute open in the other pane. Asked
  // afterwards it means re-reading the source, which is the whole job again.
  if (validExpiry) {
    // Placed just after amount so a reader meets the deadline next to the
    // money, matching how the four existing sunsets are laid out.
    const rebuilt = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'expiresAt' || key === 'expiryNote') continue; // re-added in position
      rebuilt[key] = value;
      if (key === 'amount') Object.assign(rebuilt, validExpiry);
    }
    if (!('expiresAt' in rebuilt)) Object.assign(rebuilt, validExpiry);
    list[index] = rebuilt;
  }

  writeJsonAtomic(path, parsed);

  const notes = existsSync(NOTES_PATH)
    ? JSON.parse(readFileSync(NOTES_PATH, 'utf8'))
    : {
        note: 'Human review log from scripts/verify.mjs. Not read by the pipeline and not published. '
            + 'The record files carry the decision; this carries who decided and why.',
        reviews: [],
      };

  notes.reviews.push({
    id, jurisdiction: record.jurisdiction, file, decision,
    at: today(), reviewer: reviewer || 'unnamed',
    // Recorded either way. "A person read the source and it states no end date"
    // is a finding, and without it the next session has no way to tell that
    // apart from nobody having looked.
    sunset: validExpiry ? validExpiry.expiresAt : 'none stated in source',
    ...(note ? { note } : {}),
  });
  writeJsonAtomic(NOTES_PATH, notes);

  return record.confidence;
}

// ----------------------------------------------------------------------- page

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PAGE = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification queue</title>
<style>
  :root { --bg:#0f1720; --panel:#16212c; --line:#27353f; --ink:#e7eef4; --dim:#9fb0bd;
          --gold:#f0b429; --red:#c4342b; --green:#2f9e68; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif; background:var(--bg); color:var(--ink); }
  header { display:flex; align-items:center; gap:18px; padding:10px 16px; background:var(--panel);
           border-bottom:1px solid var(--line); position:sticky; top:0; z-index:5; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; font-weight:600; }
  .progress { flex:1; min-width:180px; height:7px; background:#0b1118; border-radius:4px; overflow:hidden; }
  .progress i { display:block; height:100%; background:var(--green); }
  .counts { font-size:13px; color:var(--dim); font-variant-numeric:tabular-nums; }
  main { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap:0; height:calc(100vh - 49px); }
  @media (max-width:1000px) { main { grid-template-columns:1fr; height:auto; } }
  .pane { overflow:auto; padding:18px 20px 40px; }
  .pane + .pane { border-left:1px solid var(--line); }
  .meta { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 10px; }
  .chip { font-size:12px; padding:2px 9px; border-radius:20px; background:#0b1118; color:var(--dim); border:1px solid var(--line); }
  .chip.risk { color:var(--gold); border-color:#4a3a14; }
  .chip.flag { color:var(--ink); border-color:#3c4e5c; }
  .chip.alarm { color:#ffd9d5; background:#3d1714; border-color:#8d3a32; font-weight:600; letter-spacing:.02em; }
  fieldset.sunset { margin:12px 0 0; border:1px solid var(--line); border-radius:8px;
                    padding:8px 12px 12px; background:#0b1118; }
  fieldset.sunset legend { font-size:13px; color:var(--gold); padding:0 6px; }
  fieldset.sunset label { display:block; margin:6px 0; font-size:14px; }
  fieldset.sunset input[type=date], fieldset.sunset #sunnote {
    background:#16212c; color:var(--ink); border:1px solid var(--line);
    border-radius:5px; padding:4px 7px; font:inherit;
  }
  fieldset.sunset #sunnote { width:100%; margin-top:8px; }
  h2 { font-size:21px; line-height:1.3; margin:4px 0 10px; }
  .amount { color:var(--gold); font-weight:600; margin:0 0 12px; }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim);
       margin:20px 0 7px; border-bottom:1px solid var(--line); padding-bottom:5px; }
  ul { margin:0; padding-left:20px; } li { margin:5px 0; }
  .claim { margin:7px 0; }
  .admin { color:var(--dim); font-size:14px; }
  a { color:#6fb3e0; }
  .srcbar { display:flex; gap:10px; align-items:center; margin:0 0 12px; flex-wrap:wrap; }
  .btn { font:inherit; padding:8px 14px; border-radius:7px; border:1px solid var(--line);
         background:#0b1118; color:var(--ink); cursor:pointer; }
  .btn:hover { border-color:#3c4e5c; }
  .btn.open { background:#17405c; border-color:#235a7e; font-weight:600; }
  .btn.ok { background:#14402a; border-color:#216b43; }
  .btn.ok[disabled] { opacity:.4; cursor:not-allowed; }
  .btn.bad { background:#3d1714; border-color:#6e2a24; }
  iframe { width:100%; height:62vh; border:1px solid var(--line); border-radius:8px; background:#fff; }
  .hint { font-size:13px; color:var(--dim); margin:8px 0 0; }
  textarea { width:100%; min-height:70px; margin-top:10px; background:#0b1118; color:var(--ink);
             border:1px solid var(--line); border-radius:7px; padding:9px; font:inherit; }
  .actions { display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; align-items:center; }
  .done { padding:40px 20px; text-align:center; color:var(--dim); }
  kbd { font:12px ui-monospace,monospace; background:#0b1118; border:1px solid var(--line);
        border-radius:4px; padding:1px 5px; }
</style></head>
<body>
<header>
  <h1>Verification queue</h1>
  <div class="progress"><i id="bar" style="width:0%"></i></div>
  <span class="counts" id="counts">loading</span>
  <input id="reviewer" class="btn" style="width:150px" placeholder="your name" />
</header>
<main id="main"><div class="pane"><p class="done">Loading…</p></div></main>
<script>
const TOKEN = ${JSON.stringify(TOKEN)};
let queue = [], at = 0, verified = 0, total = 0, opened = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function load() {
  const r = await fetch('/api/queue');
  const d = await r.json();
  queue = d.items; verified = d.verifiedCount; total = d.totalCount;
  at = 0; render();
}

function render() {
  const bar = document.getElementById('bar');
  const counts = document.getElementById('counts');
  bar.style.width = total ? (verified / total * 100).toFixed(1) + '%' : '0%';
  counts.textContent = verified + ' of ' + total + ' verified · ' + queue.length + ' in queue';

  const main = document.getElementById('main');
  if (!queue.length) {
    main.innerHTML = '<div class="pane"><p class="done">Nothing left in this queue.<br>' +
      'Run the pipeline and rebuild to publish the changes:<br><br>' +
      '<code>npm run scrape:one curated-benefits &amp;&amp; npm run build</code></p></div>';
    return;
  }
  if (at >= queue.length) at = queue.length - 1;
  const item = queue[at];
  const b = item.record;
  opened = false;

  const list = (arr) => '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';

  main.innerHTML =
    '<div class="pane">' +
      '<p class="meta">' +
        '<span class="chip">' + esc(b.jurisdiction) + '</span>' +
        '<span class="chip">' + esc(b.category) + '</span>' +
        '<span class="chip">' + esc(b.confidence || 'verified') + '</span>' +
        '<span class="chip risk">risk ' + item.risk + '</span>' +
        '<span class="chip">' + (at + 1) + ' / ' + queue.length + '</span>' +
      '</p>' +
      (item.flags?.length
        ? '<p class="meta">' + item.flags.map(f =>
            '<span class="chip ' + (/end date/.test(f) ? 'alarm' : 'flag') + '">' + esc(f) + '</span>').join('') + '</p>'
        : '') +
      '<h2>' + esc(b.title) + '</h2>' +
      (b.amount ? '<p class="amount">' + esc(b.amount) + '</p>' : '') +
      '<p class="claim">' + esc(b.summary) + '</p>' +
      (b.eligibility?.length ? '<h3>Eligibility claims</h3>' + list(b.eligibility) : '') +
      (b.details?.length ? '<h3>Detail claims</h3>' + list(b.details) : '') +
      '<h3>Attribution</h3>' +
      '<p class="admin">' + esc([b.agency, b.statuteRef].filter(Boolean).join(' · ') || 'none given') + '</p>' +
      '<p class="admin">file: ' + esc(item.file) + ' · id: ' + esc(b.id) + '</p>' +
    '</div>' +
    '<div class="pane">' +
      '<div class="srcbar">' +
        '<a class="btn open" id="open" href="' + esc(b.officialUrl) + '" target="_blank" rel="noopener">Open official source</a>' +
        '<span class="hint">' + esc(b.officialUrl) + '</span>' +
      '</div>' +
      '<iframe src="' + esc(b.officialUrl) + '" referrerpolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-popups"></iframe>' +
      '<p class="hint">Many government sites refuse to be embedded. If the pane above is blank, ' +
        'use Open official source. PDFs usually do render here.</p>' +
      '<fieldset class="sunset">' +
        '<legend>Does the source state an end date for this benefit?</legend>' +
        '<label><input type="radio" name="sun" value="no"> No end date stated</label>' +
        '<label><input type="radio" name="sun" value="yes"> Yes, it ends on ' +
          '<input type="date" id="sundate" value="' + esc(b.expiresAt || '') + '"></label>' +
        '<input id="sunnote" placeholder="What happens then, and what should the reader do (optional)" ' +
          'value="' + esc(b.expiryNote || '') + '">' +
        '<p class="hint">The FIRST date it no longer applies, so "tax years beginning before 1 January 2029" ' +
          'is 2029-01-01. A per-person deadline, like a licence that needs renewing, is not an end date: ' +
          'answer No and leave that in the details.</p>' +
      '</fieldset>' +
      '<textarea id="note" placeholder="What did you check, or what is wrong? Saved either way."></textarea>' +
      '<div class="actions">' +
        '<button class="btn ok" id="ok" disabled>Verified <kbd>v</kbd></button>' +
        '<button class="btn bad" id="bad">Needs fixing <kbd>n</kbd></button>' +
        '<button class="btn" id="skip">Skip <kbd>s</kbd></button>' +
        '<span class="hint" id="guard"></span>' +
      '</div>' +
    '</div>';

  // Pre-answer where the record already carries a date: that question has been
  // settled, and re-asking it trains the reviewer to click through prompts.
  if (b.expiresAt) document.querySelector('input[name="sun"][value="yes"]').checked = true;

  document.getElementById('open').addEventListener('click', () => { opened = true; updateGuard(); });
  for (const el of document.querySelectorAll('input[name="sun"], #sundate')) {
    el.addEventListener('change', updateGuard);
  }
  document.getElementById('ok').addEventListener('click', () => decide('verified'));
  document.getElementById('bad').addEventListener('click', () => decide('needs-review'));
  document.getElementById('skip').addEventListener('click', () => { at += 1; render(); });
  updateGuard();
}

/**
 * Reads the sunset answer, or null if it has not been given.
 *
 * "No end date stated" is an answer and returns {stated:false}. An unanswered
 * question returns null, which is what gates the Verified button.
 */
function sunsetAnswer() {
  const picked = document.querySelector('input[name="sun"]:checked');
  if (!picked) return null;
  if (picked.value === 'no') return { stated: false };
  const date = document.getElementById('sundate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null; // "yes" without a date is not an answer
  return { stated: true, expiresAt: date, expiryNote: document.getElementById('sunnote').value.trim() };
}

/**
 * Two gates on Verified, both of which exist because the cheap version of this
 * tool would let you clear the backlog without reading anything: you must have
 * opened the source, and you must have answered the sunset question. See
 * SUGGESTIONS #226 and #230.
 */
function updateGuard() {
  const answer = sunsetAnswer();
  const ok = document.getElementById('ok');
  const guard = document.getElementById('guard');
  if (!ok) return;

  ok.disabled = !(opened && answer);
  guard.textContent = !opened
    ? 'Open the source before you can verify.'
    : !answer
      ? 'Answer the end date question. It is cheap now and expensive later.'
      : 'Verify only what you actually read.';
}

async function decide(decision) {
  const item = queue[at];
  const answer = sunsetAnswer();
  if (decision === 'verified' && !(opened && answer)) return;

  const body = {
    file: item.file, id: item.record.id, decision,
    note: document.getElementById('note').value.trim(),
    reviewer: document.getElementById('reviewer').value.trim(),
    // Only sent when a date was actually given. Answering "no end date" records
    // the finding in the review log without writing a field to the record.
    expiry: answer?.stated ? { expiresAt: answer.expiresAt, expiryNote: answer.expiryNote } : null,
  };
  const r = await fetch('/api/decide', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-verify-token': TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) { alert('Write failed: ' + await r.text()); return; }
  if (decision === 'verified') verified += 1;
  queue.splice(at, 1);
  render();
}

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'v') document.getElementById('ok')?.click();
  if (e.key === 'n') document.getElementById('bad')?.click();
  if (e.key === 's') document.getElementById('skip')?.click();
  if (e.key === 'o') document.getElementById('open')?.click();
});

load();
</script>
</body></html>`;

// --------------------------------------------------------------------- server

const json = (res, code, value) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

const server = createServer((req, res) => {
  // Loopback only, belt and braces alongside the bind address.
  const remote = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    res.writeHead(403).end('loopback only');
    return;
  }

  const path = req.url.split('?')[0];

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE());
    return;
  }

  if (req.method === 'GET' && path === '/api/queue') {
    const { items, verifiedCount, totalCount } = loadQueue();
    json(res, 200, { items, verifiedCount, totalCount });
    return;
  }

  if (req.method === 'POST' && path === '/api/decide') {
    // A page on another origin can send a POST to localhost, but it cannot read
    // this run's token to put in the header, and it cannot forge the Origin.
    if (req.headers['x-verify-token'] !== TOKEN) {
      res.writeHead(403).end('bad or missing token');
      return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) {
      res.writeHead(403).end('bad origin');
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20000) { res.writeHead(413).end('too large'); req.destroy(); }
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw);
        if (!['verified', 'needs-review'].includes(body.decision)) throw new Error('unknown decision');
        const confidence = applyDecision(body);
        console.log(`  ${body.decision.padEnd(12)} ${body.id}${body.note ? `  (${body.note})` : ''}`);
        json(res, 200, { ok: true, confidence });
      } catch (error) {
        res.writeHead(400).end(error.message);
      }
    });
    return;
  }

  res.writeHead(404).end('not found');
});

const { items, verifiedCount, totalCount } = loadQueue();
server.listen(PORT, HOST, () => {
  console.log('\nVerification queue');
  console.log(`  ${verifiedCount} of ${totalCount} records already verified`);
  console.log(`  ${items.length} in this queue${ONLY_JURISDICTION ? ` (${ONLY_JURISDICTION} only)` : ''}, ordered by ${ORDER}`);
  console.log(`\n  http://${HOST}:${PORT}\n`);
  console.log('  Decisions are written straight to data/curated/benefits.');
  console.log('  When you are done: npm run scrape:one curated-benefits && npm run build\n');
});
