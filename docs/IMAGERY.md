# Photography

The single biggest thing that would lift this site is real faces. Colour and
motion can only do so much: a page about Veterans with no Veterans on it reads
as a database, and a database is not something a 26 year old shares with a
buddy who just separated.

This is what to get, where to get it legally, and what will get us in trouble.

## What we need first

Three hero panels, already wired up. Drop files in and edit
`data/curated/hero.json`. No code change needed.

| Slot | Caption | What it should show |
|---|---|---|
| `veterans` | Served | One or two Veterans, mid-conversation, present day and in civilian clothes. Not saluting, not in uniform, not posed. |
| `families` | Connected | A Veteran with family. Ordinary domestic moment, not a homecoming-at-the-airport shot. |
| `service-dogs` | Supported | A working service dog with its handler, vested, behaving as a task-trained animal. |

Specs: 1600x1000 or larger, landscape, JPEG or WebP, under 400 KB each after
compression. They are cropped to 16:10 on desktop and 16:9 on mobile, so keep
the subject away from the edges. Faces should read at 360px wide, which is how
big these actually render.

## The authenticity problem

Veterans identify fake stock photography instantly, and resent it. The specific
tells, all of which are common in "veteran" stock:

- Uniform errors. Wrong rank placement, wrong ribbons, mixed service items,
  a cover worn indoors. A model in a costume is obvious to anyone who served.
- The saluting silhouette at sunset. It has become a punchline.
- Everyone young, fit, white, and male. About 17 percent of Veterans are women
  and the population is far older and more diverse than stock suggests.
- Service dogs shown as pets: no vest, being petted by strangers, out of
  position. Handlers notice immediately.

**The safest rule is to show Veterans as they are now, in civilian life, rather
than to stage anything military.** It sidesteps every uniform error at once, and
it is closer to what this site is actually about.

## Where to get images legally

### Public domain, free, and authentic

- **DVIDS** (Defense Visual Information Distribution Service) at dvidshub.net.
  US military imagery, mostly public domain as works of the federal government.
  Enormous, genuine, and free. Best first stop.
- **VA and NARA** photo collections. Same public-domain reasoning.

Caution on all of the above: a work of the US government is not protected by
copyright, but **that does not give us a personal release from the people in the
photograph**. Public domain solves copyright, not publicity rights. See below.

### Licensed stock

Workable if chosen carefully against the tells above. Buy an extended or
commercial licence, since this site will carry advertising. Keep the licence
receipt.

### Commissioned

The best option, and not necessarily expensive. A local photographer plus
Veterans from Tony's own network would produce images nobody else has, which is
worth real money in a category where every competitor uses the same stock.

## Releases, which are not optional here

USVetHub is a commercial site that will carry advertising. That means using a
recognisable person's image is a commercial use, and implied consent does not
cover it.

- Every identifiable person needs a signed model release.
- Children need a parent or guardian signature.
- Record where the release is filed in the `release` field of that panel in
  `data/curated/hero.json`. If the field is empty, assume no release exists.
- Public domain status does **not** waive this. A DVIDS photo can be free of
  copyright and still expose us if we use a recognisable service member's face
  to advertise a commercial product.

Where a release is not available, use images where nobody is identifiable:
hands, backs, silhouettes, wide shots, or detail images.

## Credit

Set `credit` on a panel in `hero.json` and it renders in the corner of the
image. Required by most stock licences and by ordinary good manners for
commissioned work.
