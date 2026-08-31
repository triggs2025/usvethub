/**
 * USVetHub admin Worker.
 *
 * WHAT THIS CAN DO: read and write its own D1 database, and hand a signed-in
 * human a JSON file to save.
 *
 * WHAT THIS CANNOT DO, BY CONSTRUCTION: change usvethub.com. It holds no GitHub
 * token, no deploy key, and no write path to the repo or to dist/. Publishing
 * takes a person committing the exported file to git, after which it passes the
 * same schema gate as every other record. If this Worker were fully
 * compromised, the attacker would have this Worker and this database. The
 * public site would be untouched, and that is the entire point of separating
 * them.
 *
 * Other boundaries kept deliberately:
 *
 *   - Its own D1 database, not shared with anything else on the account.
 *   - Identity is Cloudflare Access. No password, no session, no user table.
 *     Every request is verified, and an unverifiable request is refused.
 *   - Submitter email addresses live here and are never exported, because the
 *     public repo has a no-PII rule and a repo cannot forget.
 *   - No dependencies. Nothing in this Worker was written by anyone else.
 *   - The admin UI runs under the same CSP discipline as the public site: no
 *     inline script, no third-party anything.
 */
import { verifyAccess } from './access.mjs';
import { validateSponsor, approvalBlockers, SLOTS, ADVERTISER_CATEGORIES } from './validate.mjs';
import { ADMIN_HTML, ADMIN_JS } from './ui.mjs';

/** Business dates are Arizona dates. Same clock as the public site. */
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const nowIso = () => new Date().toISOString();

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  // Unlike the public site this is a real header, so frame-ancestors works.
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS },
});

const text = (body, status, contentType) => new Response(body, {
  status,
  headers: { 'Content-Type': contentType, ...SECURITY_HEADERS },
});

async function audit(env, actor, action, entity, entityId, detail) {
  await env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(nowIso(), actor, action, entity, entityId ?? null, detail ?? null).run();
}

const parseJurisdictions = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** A database row as the API and the export describe it. */
function rowToSponsor(row) {
  const dd = {
    contactName: row.dd_contact_name,
    linkedin: row.dd_linkedin,
    facebook: row.dd_facebook,
    businessWebsite: row.dd_business_website,
    interviewedBy: row.dd_interviewed_by,
    interviewedOn: row.dd_interviewed_on,
    accreditationVerifiedOn: row.dd_accreditation_verified_on,
    notes: row.dd_notes,
  };
  return {
    id: row.id,
    advertiser: row.advertiser,
    slot: row.slot,
    jurisdictions: parseJurisdictions(row.jurisdictions),
    headline: row.headline,
    body: row.body,
    ctaLabel: row.cta_label,
    destinationUrl: row.destination_url,
    image: row.image,
    imageAlt: row.image_alt,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    advertiserCategory: row.advertiser_category,
    vaAccreditationNumber: row.va_accreditation_number,
    policyReviewedBy: row.policy_reviewed_by,
    notes: row.notes,
    dueDiligence: dd,
    status: row.status,
    rejectedReason: row.rejected_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}

/**
 * An approved sponsor as the PUBLIC pipeline expects it.
 *
 * Deliberately narrower than the row. Internal workflow fields, the rate, who
 * approved it, and anything else that is our business and not the reader's
 * simply is not in the object. The export is the boundary between the admin
 * system and the public repo, so it is the right place to drop things rather
 * than to remember to drop them later.
 */
export function toPublishedRecord(s) {
  const record = {
    id: s.id,
    advertiser: s.advertiser,
    slot: s.slot,
    headline: s.headline,
    destinationUrl: s.destinationUrl,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    policyReviewedBy: s.policyReviewedBy,
    source: { id: 'direct', title: 'Direct sale' },
    verifiedAt: today(),
  };
  if (s.jurisdictions?.length) record.jurisdictions = s.jurisdictions;
  if (s.body) record.body = s.body;
  if (s.ctaLabel) record.ctaLabel = s.ctaLabel;
  if (s.image) record.image = s.image;
  if (s.imageAlt) record.imageAlt = s.imageAlt;
  if (s.advertiserCategory) record.advertiserCategory = s.advertiserCategory;
  if (s.vaAccreditationNumber) record.vaAccreditationNumber = s.vaAccreditationNumber;

  const dd = Object.fromEntries(
    Object.entries(s.dueDiligence ?? {}).filter(([, value]) => value),
  );
  if (Object.keys(dd).length) record.dueDiligence = dd;
  return record;
}

// ------------------------------------------------------------------ routes

async function listSponsors(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM sponsors ORDER BY ends_at DESC, id ASC',
  ).all();
  const now = today();
  return json({
    today: now,
    sponsors: (results ?? []).map((row) => {
      const s = rowToSponsor(row);
      s.flight = s.startsAt > now ? 'scheduled' : s.endsAt < now ? 'ended' : 'live';
      s.blockers = approvalBlockers(s);
      return s;
    }),
  });
}

async function saveSponsor(request, env, actor) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'body must be JSON' }, 400);

  const { errors, value } = validateSponsor(input);
  if (errors.length) return json({ errors }, 422);

  const existing = await env.DB.prepare('SELECT id, status, created_at, created_by FROM sponsors WHERE id = ?')
    .bind(value.id).first();

  // An exported record is already in git. Editing it here would produce two
  // different versions of the same ad with no way to tell which one is live.
  if (existing && existing.status === 'exported') {
    return json({
      errors: ['This sponsor has already been exported and committed. Create a new record for a renewal, so the history of what ran stays intact.'],
    }, 409);
  }

  const dd = value.dueDiligence;
  await env.DB.prepare(`
    INSERT INTO sponsors (
      id, advertiser, slot, jurisdictions, headline, body, cta_label, destination_url,
      image, image_alt, starts_at, ends_at, advertiser_category, va_accreditation_number,
      policy_reviewed_by, notes, dd_contact_name, dd_linkedin, dd_facebook,
      dd_business_website, dd_interviewed_by, dd_interviewed_on,
      dd_accreditation_verified_on, dd_notes, status, created_at, updated_at, created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      advertiser=excluded.advertiser, slot=excluded.slot, jurisdictions=excluded.jurisdictions,
      headline=excluded.headline, body=excluded.body, cta_label=excluded.cta_label,
      destination_url=excluded.destination_url, image=excluded.image, image_alt=excluded.image_alt,
      starts_at=excluded.starts_at, ends_at=excluded.ends_at,
      advertiser_category=excluded.advertiser_category,
      va_accreditation_number=excluded.va_accreditation_number,
      policy_reviewed_by=excluded.policy_reviewed_by, notes=excluded.notes,
      dd_contact_name=excluded.dd_contact_name, dd_linkedin=excluded.dd_linkedin,
      dd_facebook=excluded.dd_facebook, dd_business_website=excluded.dd_business_website,
      dd_interviewed_by=excluded.dd_interviewed_by, dd_interviewed_on=excluded.dd_interviewed_on,
      dd_accreditation_verified_on=excluded.dd_accreditation_verified_on,
      dd_notes=excluded.dd_notes, updated_at=excluded.updated_at,
      -- Any edit sends an approved record back to draft. Approval attaches to
      -- the copy that was reviewed, not to the id.
      status='draft', approved_by=NULL, approved_at=NULL
  `).bind(
    value.id, value.advertiser, value.slot,
    value.jurisdictions.length ? JSON.stringify(value.jurisdictions) : null,
    value.headline, value.body || null, value.ctaLabel || null, value.destinationUrl,
    value.image || null, value.imageAlt || null, value.startsAt, value.endsAt,
    value.advertiserCategory || null, value.vaAccreditationNumber || null,
    value.policyReviewedBy || null, value.notes || null,
    dd.contactName || null, dd.linkedin || null, dd.facebook || null,
    dd.businessWebsite || null, dd.interviewedBy || null, dd.interviewedOn || null,
    dd.accreditationVerifiedOn || null, dd.notes || null,
    'draft', existing?.created_at ?? nowIso(), nowIso(), existing?.created_by ?? actor,
  ).run();

  await audit(env, actor, existing ? 'sponsor.update' : 'sponsor.create', 'sponsor', value.id);
  return json({ ok: true, id: value.id, blockers: approvalBlockers(value) });
}

async function approveSponsor(id, env, actor) {
  const row = await env.DB.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);

  const sponsor = rowToSponsor(row);
  const blockers = approvalBlockers(sponsor);
  if (blockers.length) return json({ error: 'cannot approve', blockers }, 422);

  // The person who reviewed the advertiser against the policy and the person
  // clicking approve should be the same person, and the log should say so.
  await env.DB.prepare(
    "UPDATE sponsors SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?",
  ).bind(actor, nowIso(), nowIso(), id).run();

  await audit(env, actor, 'sponsor.approve', 'sponsor', id, sponsor.advertiser);
  return json({ ok: true });
}

async function rejectSponsor(id, request, env, actor) {
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : '';
  const result = await env.DB.prepare(
    "UPDATE sponsors SET status='rejected', rejected_reason=?, updated_at=? WHERE id=?",
  ).bind(reason || null, nowIso(), id).run();
  if (!result.meta.changes) return json({ error: 'not found' }, 404);
  await audit(env, actor, 'sponsor.reject', 'sponsor', id, reason);
  return json({ ok: true });
}

/**
 * The export. Approved sponsors, as a file to commit to the repo.
 *
 * This does not push anything anywhere. It returns a download. A person saves
 * it into data/curated/sponsors/, runs the pipeline, looks at what changed, and
 * commits. Every one of those steps is a place a human can stop, which is worth
 * more than the convenience of automating them away.
 */
async function exportSponsors(env, actor, markExported) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM sponsors WHERE status IN ('approved','exported') ORDER BY id ASC",
  ).all();

  const sponsors = (results ?? []).map(rowToSponsor);
  const blocked = sponsors.filter((s) => approvalBlockers(s).length);
  if (blocked.length) {
    return json({
      error: 'refusing to export: an approved record no longer passes its policy checks',
      records: blocked.map((s) => ({ id: s.id, blockers: approvalBlockers(s) })),
    }, 409);
  }

  const payload = sponsors.map(toPublishedRecord);

  if (markExported) {
    const ids = sponsors.map((s) => s.id);
    for (const id of ids) {
      await env.DB.prepare("UPDATE sponsors SET status='exported', updated_at=? WHERE id=?")
        .bind(nowIso(), id).run();
    }
    await audit(env, actor, 'sponsor.export', 'sponsor', null, `${ids.length} record(s)`);
  }

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="direct-sold.json"',
      ...SECURITY_HEADERS,
    },
  });
}

async function listSubmissions(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, kind, jurisdiction, payload, status, review_note, created_at, reviewed_by, reviewed_at FROM submissions ORDER BY created_at DESC LIMIT 200",
  ).all();
  // Submitter email is deliberately not selected. It is needed to reply to
  // someone, not to triage a queue, and the fewer places it is rendered the
  // fewer places it can leak.
  return json({ submissions: results ?? [] });
}

// -------------------------------------------------------------------- entry

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (!env.DB) return json({ error: 'no database binding' }, 500);

    const identity = await verifyAccess(request, env);
    if (!identity.ok) {
      // Say why, but never echo anything the caller sent. This response is the
      // one an attacker sees, so it should be useful to Tony reading logs and
      // useless to anyone else.
      return json({ error: 'forbidden', reason: identity.reason }, 403);
    }
    const actor = identity.email;

    try {
      if (request.method === 'GET' && path === '/') {
        return text(ADMIN_HTML, 200, 'text/html; charset=utf-8');
      }
      if (request.method === 'GET' && path === '/app.js') {
        return text(ADMIN_JS, 200, 'text/javascript; charset=utf-8');
      }
      if (request.method === 'GET' && path === '/api/me') {
        return json({ email: actor, today: today(), slots: SLOTS, categories: ADVERTISER_CATEGORIES });
      }
      if (request.method === 'GET' && path === '/api/sponsors') return listSponsors(env);
      if (request.method === 'POST' && path === '/api/sponsors') return saveSponsor(request, env, actor);

      const approve = path.match(/^\/api\/sponsors\/([a-z0-9-]+)\/approve$/);
      if (request.method === 'POST' && approve) return approveSponsor(approve[1], env, actor);

      const reject = path.match(/^\/api\/sponsors\/([a-z0-9-]+)\/reject$/);
      if (request.method === 'POST' && reject) return rejectSponsor(reject[1], request, env, actor);

      if (request.method === 'GET' && path === '/api/export') {
        return exportSponsors(env, actor, url.searchParams.get('mark') === '1');
      }
      if (request.method === 'GET' && path === '/api/submissions') return listSubmissions(env);

      return json({ error: 'not found' }, 404);
    } catch (error) {
      // Never return a raw error to the client: a D1 message can carry column
      // names and query fragments. Log it, return nothing useful.
      console.error('admin worker error', error.stack || error.message);
      return json({ error: 'internal error' }, 500);
    }
  },
};
