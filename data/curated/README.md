# Curated records

Hand-written, human-verified records. This is the layer a person edits.

Scrapers cover the sources that publish structured data. Plenty of state benefit
rules do not: they live in a PDF, a statute, or a paragraph halfway down a page
that no parser will ever read reliably. Those get written here instead. A
hand-checked record beats a confidently wrong scraped one, especially on the
pages that get the most traffic.

## Adding a benefit

1. Copy `benefits/_template.json` to a real name, usually the state code:
   `benefits/az.json`. Files starting with `_` are ignored.
2. One file can hold many records. It is an array.
3. Delete every `_comment` and `_fieldname` helper key. They are documentation,
   and the validator will reject them as unknown fields.
4. Check your work:

   ```bash
   npm run scrape:one curated-benefits
   ```

   Every problem is reported by field name. Nothing invalid gets published, and
   a mistake in one file never affects another.

5. Rebuild the site to see it:

   ```bash
   npm run build && npm run serve
   ```

## The one rule

**Only mark a record `"confidence": "verified"` if you personally opened the
`officialUrl` and confirmed every claim in the record.**

If you are working from memory, a secondhand summary, or something an AI told
you, use `"needs-review"`. A wrong dollar figure or a wrong deadline on this
site can cost a Veteran real money. Being incomplete is recoverable. Being
confidently wrong is not.

## What must never go in here

No personal information about any individual. Not a name, not a home address,
not a personal phone number, not an email for a private person. Office contact
details published by the organization itself are fine, and that is the limit.

Everything in this repository is published to the open web by GitHub Pages,
including files you might assume are private. A private repository does not make
the published site private.
