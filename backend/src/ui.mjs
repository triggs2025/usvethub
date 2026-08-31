/**
 * The admin interface, as two strings.
 *
 * Served by the Worker rather than built, because this is an internal tool used
 * by one or two people and a build step for it would be more machinery than the
 * thing it builds. Same discipline as the public site: no inline script, no
 * third-party anything, everything escaped on the way out.
 */

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>USVetHub admin</title>
<style>
  :root { color-scheme: light dark; --line: #8883; --bad: #b91c1c; --good: #15803d; --warn: #b45309; }
  * { box-sizing: border-box; }
  body { font: 15px/1.55 system-ui, -apple-system, sans-serif; margin: 0 auto; padding: 1.5rem 1.25rem 5rem; max-width: 1080px; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  h1 { font-size: 1.35rem; margin: 0; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .6rem; }
  .muted { opacity: .68; font-size: .87rem; }
  .banner { border: 1px solid var(--bad); color: var(--bad); border-radius: 8px; padding: .7rem .9rem; margin: 1rem 0; }
  .banner ul { margin: .3rem 0 0; padding-left: 1.1rem; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  .pill { display: inline-block; font-size: .74rem; font-weight: 700; padding: .1rem .5rem; border-radius: 99px; border: 1px solid var(--line); }
  .s-live { color: var(--good); border-color: var(--good); }
  .s-scheduled { color: var(--warn); border-color: var(--warn); }
  .s-ended { opacity: .55; }
  form { display: grid; gap: .7rem; margin-top: .6rem; }
  fieldset { border: 1px solid var(--line); border-radius: 8px; padding: .9rem 1rem 1.1rem; }
  legend { font-weight: 700; padding: 0 .35rem; }
  .grid { display: grid; gap: .7rem; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  label { display: grid; gap: .25rem; font-size: .84rem; font-weight: 600; }
  input, select, textarea { font: inherit; padding: .45rem .55rem; border: 1px solid var(--line); border-radius: 6px; background: Canvas; color: CanvasText; width: 100%; }
  textarea { min-height: 4.5rem; resize: vertical; }
  button { font: inherit; font-weight: 600; padding: .5rem .9rem; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  button.primary { background: CanvasText; color: Canvas; border-color: CanvasText; }
  button.danger { color: var(--bad); border-color: var(--bad); }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
  .note { border-left: 3px solid var(--line); padding-left: .8rem; }
</style>
</head>
<body>
<header>
  <h1>USVetHub admin</h1>
  <p class="muted" id="who"></p>
</header>

<p class="note muted">
  Nothing here is live. Approving a record marks it ready; it reaches Veterans only after you
  export it, commit it to the repo, and the site rebuilds. Read docs/ADVERTISING.md before
  approving anything, and never approve a claims-representation advertiser whose VA accreditation
  number you have not checked yourself.
</p>

<div id="errors"></div>

<h2>The book</h2>
<div class="row">
  <button id="export">Download approved as JSON</button>
  <button id="export-mark">Download and mark exported</button>
  <span class="muted">Save into <code>data/curated/sponsors/</code>, run the pipeline, then commit.</span>
</div>
<table>
  <thead><tr><th>Advertiser</th><th>Slot</th><th>Reach</th><th>Flight</th><th>Status</th><th>Blockers</th><th></th></tr></thead>
  <tbody id="rows"><tr><td colspan="7" class="muted">Loading...</td></tr></tbody>
</table>

<h2 id="form-title">New sponsor</h2>
<form id="form">
  <fieldset>
    <legend>Placement</legend>
    <div class="grid">
      <label>ID <input name="id" required placeholder="acme-legal-2026-q4"></label>
      <label>Advertiser <input name="advertiser" required></label>
      <label>Slot <select name="slot" id="slot"></select></label>
      <label>Jurisdictions <input name="jurisdictions" placeholder="AZ, NV. Blank = national, all 56"></label>
      <label>Starts <input name="startsAt" type="date" required></label>
      <label>Ends <input name="endsAt" type="date" required></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Creative</legend>
    <div class="grid">
      <label>Headline <input name="headline" required maxlength="90"></label>
      <label>CTA label <input name="ctaLabel" maxlength="40"></label>
      <label>Destination URL <input name="destinationUrl" type="url" required placeholder="https://"></label>
      <label>Image path <input name="image" placeholder="/sponsors/acme.png"></label>
      <label>Image alt <input name="imageAlt" maxlength="200"></label>
    </div>
    <label>Body <textarea name="body" maxlength="300"></textarea></label>
  </fieldset>

  <fieldset>
    <legend>Policy and vetting</legend>
    <div class="grid">
      <label>Category <select name="advertiserCategory" id="category"></select></label>
      <label>Policy reviewed by <input name="policyReviewedBy" placeholder="Your name, and the date"></label>
      <label>VA accreditation number <input name="vaAccreditationNumber"></label>
      <label>Accreditation verified on <input name="dd.accreditationVerifiedOn" type="date"></label>
      <label>Contact name <input name="dd.contactName"></label>
      <label>Interviewed by <input name="dd.interviewedBy"></label>
      <label>Interviewed on <input name="dd.interviewedOn" type="date"></label>
      <label>LinkedIn <input name="dd.linkedin" type="url"></label>
      <label>Facebook <input name="dd.facebook" type="url"></label>
      <label>Business website <input name="dd.businessWebsite" type="url"></label>
    </div>
    <label>Due diligence notes <textarea name="dd.notes" maxlength="1000"></textarea></label>
    <label>Internal notes, never shown to a reader <textarea name="notes" maxlength="500"></textarea></label>
  </fieldset>

  <div class="row">
    <button type="submit" class="primary">Save as draft</button>
    <button type="button" id="reset">Clear</button>
  </div>
</form>

<script src="app.js"></script>
</body>
</html>
`;

export const ADMIN_JS = `/* USVetHub admin UI. No dependencies, no inline handlers. */
(function () {
  'use strict';

  var rows = document.getElementById('rows');
  var errors = document.getElementById('errors');
  var form = document.getElementById('form');

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      });
  }

  function showErrors(list) {
    errors.textContent = '';
    if (!list || !list.length) return;
    var box = document.createElement('div');
    box.className = 'banner';
    var strong = document.createElement('strong');
    strong.textContent = 'Not saved:';
    box.appendChild(strong);
    var ul = document.createElement('ul');
    list.forEach(function (message) {
      var li = document.createElement('li');
      li.textContent = message;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    errors.appendChild(box);
    box.scrollIntoView({ block: 'nearest' });
  }

  function cell(row, value) {
    var td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    row.appendChild(td);
    return td;
  }

  function load() {
    api('api/sponsors').then(function (res) {
      rows.textContent = '';
      var list = (res.body && res.body.sponsors) || [];
      if (!list.length) {
        var empty = document.createElement('tr');
        var td = cell(empty, 'Nothing sold yet.');
        td.colSpan = 7;
        td.className = 'muted';
        rows.appendChild(empty);
        return;
      }
      list.forEach(function (s) {
        var tr = document.createElement('tr');
        cell(tr, s.advertiser);
        cell(tr, s.slot);
        cell(tr, s.jurisdictions && s.jurisdictions.length ? s.jurisdictions.join(', ') : 'National, all 56');

        var flight = cell(tr, '');
        var pill = document.createElement('span');
        pill.className = 'pill s-' + s.flight;
        pill.textContent = s.flight;
        flight.appendChild(pill);
        flight.appendChild(document.createTextNode(' ' + s.startsAt + ' to ' + s.endsAt));

        cell(tr, s.status);
        cell(tr, s.blockers.join(' ')).className = s.blockers.length ? 'muted' : '';

        var actions = document.createElement('td');
        if (s.status === 'draft' && !s.blockers.length) {
          var approve = document.createElement('button');
          approve.textContent = 'Approve';
          approve.addEventListener('click', function () {
            api('api/sponsors/' + encodeURIComponent(s.id) + '/approve', { method: 'POST' })
              .then(function (r) {
                if (!r.ok) showErrors(r.body.blockers || [r.body.error || 'could not approve']);
                load();
              });
          });
          actions.appendChild(approve);
        }
        if (s.status !== 'exported') {
          var edit = document.createElement('button');
          edit.textContent = 'Edit';
          edit.addEventListener('click', function () { fill(s); });
          actions.appendChild(edit);
        }
        tr.appendChild(actions);
        rows.appendChild(tr);
      });
    });
  }

  function fill(s) {
    document.getElementById('form-title').textContent = 'Editing ' + s.advertiser;
    var dd = s.dueDiligence || {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.name.indexOf('dd.') === 0) {
        el.value = dd[el.name.slice(3)] || '';
      } else if (el.name === 'jurisdictions') {
        el.value = (s.jurisdictions || []).join(', ');
      } else {
        el.value = s[el.name] == null ? '' : s[el.name];
      }
    });
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var payload = { dueDiligence: {} };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.name.indexOf('dd.') === 0) {
        payload.dueDiligence[el.name.slice(3)] = el.value;
      } else if (el.name === 'jurisdictions') {
        payload.jurisdictions = el.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      } else {
        payload[el.name] = el.value;
      }
    });

    api('api/sponsors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { showErrors(res.body.errors || [res.body.error || 'save failed']); return; }
      showErrors([]);
      form.reset();
      document.getElementById('form-title').textContent = 'New sponsor';
      load();
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    form.reset();
    document.getElementById('form-title').textContent = 'New sponsor';
    showErrors([]);
  });

  document.getElementById('export').addEventListener('click', function () {
    window.location.href = 'api/export';
  });
  document.getElementById('export-mark').addEventListener('click', function () {
    if (window.confirm('Mark these as exported? Do this only once the file is committed.')) {
      window.location.href = 'api/export?mark=1';
    }
  });

  api('api/me').then(function (res) {
    var me = res.body || {};
    document.getElementById('who').textContent =
      'Signed in as ' + (me.email || 'unknown') + ' · ' + (me.today || '') + ' Arizona';
    (me.slots || []).forEach(function (slot) {
      var option = document.createElement('option');
      option.value = slot; option.textContent = slot;
      document.getElementById('slot').appendChild(option);
    });
    var blank = document.createElement('option');
    blank.value = ''; blank.textContent = '(none)';
    document.getElementById('category').appendChild(blank);
    (me.categories || []).forEach(function (c) {
      var option = document.createElement('option');
      option.value = c; option.textContent = c;
      document.getElementById('category').appendChild(option);
    });
    load();
  });
})();
`;
