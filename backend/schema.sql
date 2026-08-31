-- USVetHub admin database.
--
-- This is the working store for things a person is still deciding about. It is
-- NOT what the public site reads. The site is built from JSON committed to git,
-- and the only way anything here reaches a Veteran is a human pressing Approve,
-- an export, and a commit. That gap is the whole security design: if this
-- database is fully compromised, an attacker gets this database. They cannot
-- change usvethub.com, because changing usvethub.com takes a git commit and the
-- record still has to pass the same schema gate as everything else.
--
--   npx wrangler d1 execute usvethub-admin --remote --file=backend/schema.sql
--
-- Safe to re-run: every statement is IF NOT EXISTS.

-- ---------------------------------------------------------------- sponsors

-- Paid placements, from first conversation to live flight.
--
-- Columns mirror data/schema/sponsor.schema.json on purpose. The export writes
-- this straight out as a curated sponsor file, so a divergence here becomes a
-- validation failure at scrape time rather than a silently malformed ad.
CREATE TABLE IF NOT EXISTS sponsors (
  id                        TEXT PRIMARY KEY,
  advertiser                TEXT NOT NULL,
  slot                      TEXT NOT NULL
                              CHECK (slot IN ('jurisdiction','discounts','organizations','free-help')),
  jurisdictions             TEXT,          -- JSON array of 2-letter codes; NULL means a national buy
  headline                  TEXT NOT NULL,
  body                      TEXT,
  cta_label                 TEXT,
  destination_url           TEXT NOT NULL,
  image                     TEXT,          -- must start with /sponsors/ ; never an advertiser's host
  image_alt                 TEXT,
  starts_at                 TEXT NOT NULL, -- YYYY-MM-DD, Arizona dates
  ends_at                   TEXT NOT NULL,
  advertiser_category       TEXT,
  va_accreditation_number   TEXT,
  policy_reviewed_by        TEXT,
  notes                     TEXT,

  -- Due diligence, required before a claims-representation or legal advertiser
  -- may run. Kept so a decision to put an ad in front of Veterans can be
  -- reconstructed a year later, by someone who was not in the room.
  dd_contact_name           TEXT,
  dd_linkedin               TEXT,
  dd_facebook               TEXT,
  dd_business_website       TEXT,
  dd_interviewed_by         TEXT,
  dd_interviewed_on         TEXT,
  dd_accreditation_verified_on TEXT,
  dd_notes                  TEXT,

  -- draft while being negotiated, approved once a named human has signed off
  -- against docs/ADVERTISING.md, exported once it has been written to git.
  -- Nothing renders from this table directly, in any status.
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','exported','rejected')),
  rejected_reason           TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  created_by                TEXT NOT NULL,
  approved_by               TEXT,
  approved_at               TEXT
);

CREATE INDEX IF NOT EXISTS sponsors_status ON sponsors (status, ends_at);

-- ------------------------------------------------------------- submissions

-- Anything a member of the public proposes: an organization we are missing, a
-- discount, a correction to a benefit.
--
-- EVERY SUBMISSION IS A PROPOSAL, NEVER A PUBLICATION. Nothing in this table is
-- reachable from the public site by any code path. It exists to be read by a
-- person, who then either writes a real record or does not.
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('organization','discount','correction','other')),
  jurisdiction  TEXT,
  payload       TEXT NOT NULL,             -- raw JSON as submitted, never interpolated anywhere
  submitter_email TEXT,                    -- PII. Never exported, never committed to the public repo.
  status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','reviewing','accepted','rejected','spam')),
  review_note   TEXT,
  created_at    TEXT NOT NULL,
  reviewed_by   TEXT,
  reviewed_at   TEXT
);

CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status, created_at);

-- --------------------------------------------------------------- audit log

-- Who did what. Append only, never updated or deleted by the application.
--
-- The advertising policy turns on a named human having reviewed an advertiser
-- against it. A claim like that is worth nothing if it cannot be checked, so
-- every approval writes a row here with the identity Cloudflare Access asserted.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC);
