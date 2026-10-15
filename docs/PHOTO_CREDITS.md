# Artist photos: sourcing, licensing and attribution

The game shows photos of bands, plus a short list of household-name solo
artists. This file records where those
photos come from, what licences permit them to ship inside the app, and how the
attribution obligations are met.

**This is engineering documentation, not legal advice.** The licences below are
well-understood and the compliance steps are standard practice, but if you are
shipping commercially, have your own review done.

---

## Why not a music API

The obvious route — pulling artist photos from a music metadata API — does not
work for an app on an app store. As of writing:

| Source | Problem |
| --- | --- |
| TheAudioDB (free tier) | Terms explicitly forbid publishing to an app store without a paid subscription. |
| Deezer | Non-commercial terms, and caching images is prohibited. |
| Last.fm | API terms are non-commercial; images are often missing or tiny. |
| Spotify | Development mode is a five-user, non-commercial sandbox. |
| MusicBrainz / Cover Art Archive | Supplies **release artwork, not artist portraits**. |

## What we use instead

**Wikidata** for the artist→genre→image mapping, and **Wikimedia Commons** for the
photos themselves.

1. Artists are selected per genre via Wikidata property **P136 (genre)**. Musical
   acts (`P31` ⊑ musical group) and solo humans (`P31` = human) are queried
   separately, the acts on their own, larger budget: sharing one query and one
   `LIMIT` let a genre's solo stars crowd its bands out entirely.
2. Only artists with a **P18 (image)** are considered, so the candidate set only
   contains artists a photo actually exists for.
3. Candidates are ranked by `wikibase:sitelinks` so the most notable artists come
   first.
4. The catalogue is **bands-only**: the fetch records whether each candidate came
   back as an act or a person, and a person is dropped unless they are on the
   hand-written household-name list. This matters for the credits below only
   because it changes *which* photos ship — the licensing checks are identical.
5. Each image's licence metadata is read from the **Commons API**
   (`prop=imageinfo`, `iiprop=extmetadata`) before anything is downloaded.

The whole pipeline is `scripts/build-catalogue.mjs`; its output is committed, so
the app ships offline and never touches the network at runtime.

```bash
node scripts/build-catalogue.mjs fetch       # Wikidata -> artists per genre
node scripts/build-catalogue.mjs licences    # Commons -> licence metadata
node scripts/build-catalogue.mjs spotify     # Spotify artist ids
node scripts/build-catalogue.mjs download    # fetch + re-encode images
node scripts/build-catalogue.mjs prune       # delete images nothing references any more
node scripts/build-catalogue.mjs generate    # emit the TypeScript the app imports
```

### Which artists, and why some are missing

The catalogue is a bands game, so an entry Wikidata types as a musical act — a
band, duo, trio, orchestra or collective — is kept, and a person is dropped.

The only exceptions are a short, hand-written list of household-name solo
artists (Elvis Presley, Michael Jackson, Ozzy Osbourne, Ed Sheeran and the rest
of `HOUSEHOLD_SOLO_ARTISTS`) in `scripts/build-catalogue.mjs`. It is
deliberately a named list rather than a notability cutoff: Wikipedia language
counts cannot tell a household-name musician from a household-name actor —
Ozzy Osbourne has 106 language editions and Ed Sheeran 94, against 147 for
Johnny Depp and 127 for Steven Seagal — so any threshold that keeps the singers
also keeps the celebrities, and only a list says what is meant. Editing that
list is the single lever for how "bandy" the game feels.

Each act is also filed under exactly one genre, decided by the `assign` stage. Most acts state a genre
for a single bucket; the rest are settled by a fixed precedence order plus a hand-written override
list, so an act never appears in two genres' line-ups. That changes *which* photos ship per genre and
nothing else.

A `solo` stage survives as a secondary guard. It drops someone who is only a
band member: in at least one group, fewer than **3** albums of their own, and
performer on fewer than **10** releases of any kind. A band entry always passes
it, and the household names are already known soloists, so it is belt-and-braces
now rather than the main filter.

Because the selection changes, `prune` is what keeps the shipped photos honest:
it deletes any image the current catalogue no longer references.

Run the stages in the order above — `licences`, `spotify` and `download` all
select the artists they work on through the same helper, so they follow the band
rule and the `solo` verdict automatically.

As shipped, that is 12 genres × 50 acts, of which **598 have a licence-clean photo** — 598 of the 600
genre slots. Anything without one — only Commons images under NC/ND, or no P18 image at all — falls
back to generated artwork.

## Licence policy

Every image is checked against an allowlist before download. An image is kept
only if its Commons licence is:

- **CC0 / public domain**, or
- **any Creative Commons Attribution licence** — CC BY 2.0/2.5/3.0/4.0 and the
  national ports, CC BY-SA 1.0/2.0/2.1/2.5/3.0/4.0 and the national ports.

Rejected outright:

- **NonCommercial (NC)** and **NoDerivatives (ND)** variants — not usable here.
- **GFDL** and the **Free Art License (FAL)** — copyleft licences with terms we
  are not relying on.
- Anything with a blank or unrecognised licence string.

In practice roughly 98% of the candidate images pass. Anything that fails simply
means that artist falls back to generated artwork.

## How attribution is satisfied

CC BY and CC BY-SA require credit, a licence reference, and an indication of
changes. Creative Commons recommends the **TASL** pattern — Title, Author,
Source, Licence — which is what the app does:

- The **Credits screen** (`/credits`, linked from Instructions) lists every
  bundled photo with its artist name, the photograph's title, the photographer,
  a link to the licence, and a link to the Commons file page.
- The screen also states plainly that each photo has been **cropped and resized**
  for the game tiles, satisfying the "indicate changes" condition.

Records live in `artist-credits.generated.ts`, generated from Commons metadata —
so the credits cannot drift out of step with the images that actually shipped.
The generator walks the image map rather than the other way round, which keeps
the two in exact 1:1 correspondence: as shipped, 598 images and 598 credit
records, with no image lacking attribution.

Some public-domain files carry no `LicenseUrl` on Commons. Those credits render
the licence name as plain text instead of a dead link, and always link to the
Commons file page.

## ShareAlike and the app itself

CC BY-SA applies to **adaptations of the licensed work**, not to a program that
merely contains it. Resizing and re-encoding a photo produces an adaptation *of
that photo*, which stays under the same licence — it does not relicense the
application. The app's own source and code are unaffected.

## Residual risks to be aware of

- **Personality / publicity rights.** A photographer's copyright licence does not
  grant the depicted person's likeness rights. Some Commons file pages carry a
  `Personality rights` warning. The game is free and shows artists in a factual,
  non-endorsing context, which is the usual low-risk posture — but this is the
  one area where jurisdiction matters and a lawyer should look if you monetise.
- **Commons metadata accuracy.** Commons itself does not warrant that every
  licence label is correct. The build checks and records the licence it relied
  on; if you want higher assurance, spot-check the file pages of the artists that
  matter most.
- **Trademarks and logos.** If a photo happens to feature a logo, copyright
  permission does not imply trademark permission.

## Regenerating

```bash
# Wikimedia asks for a contactable User-Agent; set yours rather than relying
# on the built-in identifier.
CATALOGUE_USER_AGENT='BandPickCatalogueBuilder/1.0 (you@yourdomain.com)' \
  node scripts/build-catalogue.mjs all
```

The build is resumable: images already downloaded are skipped, and licence
metadata is cached in `.catalogue/`, so an interrupted run picks up where it
stopped.

Etiquette matters here, and one detail is easy to get wrong:

- **Only request Wikimedia's standard thumbnail sizes** (120, 250, 330, 500, 960,
  … — see <https://w.wiki/GHai>). A request for any other width is refused, and a
  request for the *original* file is refused outright for hotlinking clients; it
  comes back as a 429 pointing at that size list. The generator therefore fetches
  at **500px** and resizes to 400px locally.
- Requests are serialised at a **measured-safe 1.2 s gap**, in an interleaved
  genre order so an interrupted run leaves every genre with a similar number of
  photos.
- `Retry-After` is honoured (capped so one file cannot stall the pass), and the
  gap widens automatically when the server asks us to slow down.

A note on the User-Agent: Wikimedia requires a meaningful identifier and
blocklists placeholder contacts such as `someone@example.com`. The built-in
identifier works; set `CATALOGUE_USER_AGENT` if you want to add your own contact
details.

## Changing what ships

- **Remove a photo**: delete its entry from `artist-images.generated.ts` (or add
  the artist to `MANUAL_OVERRIDES` in `artist-images.ts` to point elsewhere).
- **Add your own licensed photo**: put the file in `src/assets/artists/` and map
  it in `MANUAL_OVERRIDES`.
- **Drop the photos entirely**: empty `artist-images.generated.ts`. Every tile
  falls back to generated artwork and the game still plays identically.
