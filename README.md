# BandPick

A band-vs-band knockout game. Two bands take the stage, you tap the one you prefer, your pick keeps
its tile and a new challenger steps up — until your champion is crowned.

Built with **Angular + Ionic + Capacitor**, ready to ship to the **Google Play Store**.

---

## The game

| Screen | What it does |
| --- | --- |
| **Home** | `Play` and `Instructions`. Play always starts a fresh run. |
| **Instructions** | The four steps, the house rules and the full genre list. |
| **Setup** | Pick a format (`Standard` or `Bracket`), a genre (12 styles) and a length, then `Start`. |
| **Battle** | Two band tiles with photos. Tap one — in a standard game it stays put and the other tile gets a new challenger; in a bracket the winner advances a round. A progress bar tracks the game. |
| **Results** | The champion fills the top of the screen, and what it beat sits below: the **two-column** list of artists with the round they went out in (a standard game), or the **bracket drawn as a tree** — stages as columns, connectors joining each pair of duels to the one they fed (a knockout), with the final duel carrying the crown. Then **Listen to the band** opens the champion in Spotify, then the share area. |
| **Credits** | Photo attribution, as required by the licences the photos ship under. |

### Two formats

**Standard (survivor streak)** — a game of **N rounds** uses **N + 1 artists**: two open the game,
and every later round adds exactly one newcomer, producing **N eliminations**. Your pick **keeps its
tile**, so you can watch your champion survive. Choose 1 to 20 rounds; the longest game needs 21
artists.

**Bracket (single elimination)** — **last 8 or last 16** artists, seeded at random. Everyone is paired
off, each winner advances and each loser is out for good: for 16 entrants that is 8 duels in the round
of 16, then the quarter-finals, the semi-finals and the final. A last-16 bracket is 15 duels to the
crown, and the champion survives one duel per stage.

Either way:

- No scoring, no timers, no stored results — the champion is simply the band you picked last.
- An act never appears twice in the same game, and the line-up is reshuffled every run.
- Every genre ships with 50 acts, so both formats always fill.

---

## Getting started

```bash
npm ci               # install exactly the locked dependencies
npm start            # dev server on http://localhost:4200
npm test             # unit + render tests (Vitest, jsdom)
npm run lint
npm run build        # production build into www/
```

### Project structure

```
src/app/
  core/
    data/catalogue.generated.ts       # GENERATED: 12 genres x 50 acts (Wikidata)
    data/artist-images.generated.ts   # GENERATED: artist id -> bundled photo
    data/artist-credits.generated.ts  # GENERATED: attribution for every photo
    data/artist-spotify.generated.ts  # GENERATED: artist id -> Spotify artist id
    data/genres.data.ts               # public entry point for the catalogue
    data/artist-images.ts             # photo resolution + manual overrides
    models/                           # Artist, Genre, Matchup, Elimination, PhotoCredit
    services/game.service.ts          # the gauntlet rules, as signals
    services/share.service.ts         # native share sheet, per-network links, clipboard
    services/share-card.service.ts    # canvas renderer for the share image
    services/spotify.service.ts       # Spotify player + links, no API key needed
    guards/game.guards.ts             # /battle and /results need the matching game state
  pages/                              # home, instructions, setup, battle, results, credits
  shared/artist-art.ts                # deterministic gradient + initials from a name
  shared/artist-avatar.component.ts   # photo when available, generated art otherwise
  shared/bracket-board.ts             # knockout history -> bracket columns (screen + card)
scripts/build-catalogue.mjs           # builds the catalogue + photos from Wikidata/Commons
scripts/generate-icons.mjs            # regenerates assets/*.png from vector paths
assets/                               # icon + splash sources consumed by @capacitor/assets
android/                              # Capacitor Android project
```

The game state lives in `GameService` as **signals**, which is what Angular's zoneless change
detection wants. `GameService` has no dependencies, so its rules are unit-tested directly.

---

## The artist catalogue

12 genres, 50 acts each, generated from **Wikidata** by `scripts/build-catalogue.mjs` and committed
to the repo. The app therefore works completely offline — no API keys, no rate limits, no runtime
network calls. Acts are ranked by Wikidata sitelink count, so the most recognisable ones come first in
each genre — which is exactly what the 50-per-genre cut is: the acts with the most Wikipedia language
editions, and therefore the names most likely to be known. A hundred per genre reached deep enough
that most of a line-up was unfamiliar; 50 leaves headroom for both formats (a 20-round survivor game
needs 21 acts, a bracket 16) while keeping each genre to names worth picking between.

It is a **bands catalogue**. An entry Wikidata types as a musical act — a band, duo, trio, orchestra
or collective — is kept; a person is dropped. The only exceptions are a short, hand-written list of
household-name solo artists (`HOUSEHOLD_SOLO_ARTISTS` in the script): Elvis Presley, Michael Jackson,
Ozzy Osbourne, Ed Sheeran and around seventy more, so a bracket never looks like it is missing the
obvious legends. Jazz is the one genre that leans on the list rather than the rule — its canon is
bandleaders, so twenty-four of the seventy-eight are jazz greats, and without them the genre fills
with groups nobody has heard of. The list is deliberate rather than a notability threshold, because fame cannot
express the idea — Ozzy Osbourne has fewer Wikipedia language editions than Johnny Depp, so any cutoff
that keeps the singer also keeps the actor, and any cutoff that drops the actor also drops Ed
Sheeran. Editing that list is the single lever for how "bandy" the game feels.

Acts are queried **separately** from people, on their own budget. Sharing one genre query and one
`LIMIT` between the two let a genre's solo stars crowd its bands out — Jazz came back with eight
groups that way, not because Wikidata lacks jazz bands but because a hundred soloists outranked every
one of them. The fetch now records on each candidate whether Wikidata says act or person, so the rule
needs no second round of lookups, and `selectArtists` is the one place it is applied — the licence,
Spotify and download stages follow it automatically.

**Every act appears in exactly one genre.** A run picks a genre and then plays that genre's acts, so
an act filed under two genres turns up twice in the same pool of names — The Beatles in both Pop and
Rock reads as a bug, not a feature. Most acts never need deciding: 4,158 of the 4,574 eligible ones
carry a genre statement for a single bucket. The 416 that carry several are settled by a fixed
precedence (narrow before broad, with `pop` last, because "also has a pop statement" describes most
crossovers and says the least), plus a short hand-written override list for the ones the order gets
wrong — Linkin Park sits in **Metal**, not Indie & Alternative, which is where Wikidata's "nu metal"
label would have put it. The `assign` stage resolves this once into `.catalogue/genre-assignment.json`,
and the licence, Spotify, download and generate stages all filter on it.

Everyone listed is also **known for making music**. A genre statement plus a photo is not proof of
that — Wikidata gives a genre to anyone who ever released a record, so the catalogue used to fill up
with people famous for something else entirely (Hulk Hogan and Shaquille O'Neal, each with one
novelty single; plus actors, a wrestler, a crown prince and a football player). The `knownfor` stage
reads the opening sentence of each artist's own Wikipedia article and keeps only those that name a
musical role — or a music genre next to "artist", as in "is an Italian reggae artist". The bands-only
rule already excludes those celebrities, so this stage is now chiefly a guard on the household-name
list; entries with no English article are kept. Wikidata occupations were measured and rejected as a
fallback — Hogan's own item lists guitarist, rapper and record producer alongside professional
wrestler.

To change it, edit the generator and re-run it — never hand-edit `catalogue.generated.ts`:

```bash
node scripts/build-catalogue.mjs generate   # regenerate from the cached fetch
node scripts/build-catalogue.mjs spotify    # refresh the Spotify artist ids
node scripts/build-catalogue.mjs prune      # drop images the catalogue no longer references
node scripts/build-catalogue.mjs all        # full refresh from Wikidata + Commons
```

### Listen on Spotify

The results screen ends with the champion's Spotify player, so a run can turn into actually hearing
the winner. Every artist in the catalogue carries Spotify's own **artist id**, read from Wikidata's
P1902 property by the `spotify` stage and committed to `artist-spotify.generated.ts` — **545 acts
have one** (32–50 per genre).

There is **no Spotify API key, no OAuth and no backend** involved. A Spotify artist id is a public
identifier and `open.spotify.com/embed/artist/<id>` is a player any page may frame, so the section
costs nothing at runtime and the app stays offline-first. Spotify's Web API would have needed client
credentials and a token before the results screen could even render.

- **With an id** — the artist's player is embedded, plus an `Open in Spotify` button that hands the
  artist page to the app or the web player.
- **Without one** — no broken frame; the button becomes `Find on Spotify` and opens a search for the
  artist's name, so the section is never a dead end.
- Ids are validated (22 base-62 characters) before they reach a URL or an iframe, so a bad Wikidata
  edit cannot inject anything into the page.

On Android the embed renders inside the WebView but playback may be limited to short previews
(Spotify only supports full playback in browsers it lists); the `Open in Spotify` button is the
reliable path there. The permissions on the iframe — including `encrypted-media`, without which
playback degrades to previews — are written literally in `results.page.html`, because Angular
refuses to bind `allow` on an iframe for security reasons.

`prune` matters when the selection moves: downloads only ever add files, so a superseded photo would
otherwise keep shipping in the bundle. It refuses to delete anything if the manifest is empty.

### Artist photos

Each artist tile shows a **photo from Wikimedia Commons**. Every photo is licence-checked at build
time and ships with the attribution its licence requires, surfaced in the app's Credits screen.

Photos are bundled, not hotlinked: **598 acts ship with a photo**, covering 598 of the 600 genre
slots. The other two — a photo whose Commons licence is non-commercial or no-derivatives, or no P18
image at all — fall back to generated artwork (a stable gradient plus initials from the name), so a
missing photo never leaves a blank tile.

**Read [`docs/PHOTO_CREDITS.md`](docs/PHOTO_CREDITS.md) before changing any of this.** It covers why
the music APIs were rejected, the licence allowlist, how attribution is satisfied, and the residual
personality-rights risk. In short:

- Photos come from Wikidata's P18 property pointing at Commons files — not from a music API.
- Only CC0, public domain, CC BY and CC BY-SA images are accepted; NC and ND are rejected.
- Every image is cropped and resized, which the Credits screen discloses.
- ShareAlike applies to the adapted *photo*, not to the app.

To override or add a photo of your own, use `MANUAL_OVERRIDES` in
`src/app/core/data/artist-images.ts`. To drop photos entirely, empty
`artist-images.generated.ts` — the game plays identically with generated artwork.

### App size

The bundled photos dominate the download. At 400px and JPEG quality 76 (sourced from Wikimedia's
500px thumbnails, the smallest standard size they serve) they average about 25 kB, so the 598 photos
add roughly **15 MB** and the whole app builds to about **16 MB**. The JavaScript is negligible by
comparison: 165 kB gzipped on first load. If the install size matters for conversion, lower
`THUMB_WIDTH`/`JPEG_QUALITY` in the generator or reduce the artist count per genre.

> Etiquette note: Wikimedia only serves hotlinked thumbnails at its [standard sizes](https://w.wiki/GHai)
> (120, 250, 330, 500, 960, …) and rejects any other width, so the generator fetches at 500 and
> resizes locally. Requests are serialised at a measured-safe 1.2 s gap and `Retry-After` is honoured.

---

## Android

The native project is already generated and configured.

```bash
npm run android:sync      # ng build + cap sync android
npm run android:open      # open the project in Android Studio
npm run android:apk       # debug APK
npm run android:bundle    # release AAB for Play
npm run assets            # regenerate icons/splash, then the Android resources
```

| Setting | Value | Where |
| --- | --- | --- |
| App ID | `com.bandpick.app` | `capacitor.config.ts`, `android/app/build.gradle` |
| App name | `BandPick` | `capacitor.config.ts`, `android/app/src/main/res/values/strings.xml` |
| `minSdkVersion` | 24 | `android/variables.gradle` |
| `compileSdkVersion` / `targetSdkVersion` | **36** | `android/variables.gradle` |

**Confirm the app ID before your first upload** — it is permanent once published. It is currently
`com.bandpick.app`; to publish under a different id, set your reverse-DNS name in
`capacitor.config.ts`, then re-run `npx cap sync android` and update `applicationId` + `namespace` in
`android/app/build.gradle`, the `package_name` / `custom_url_scheme` strings, and the Java package
folder to match.

Icons and splash screens are generated from `assets/` with no font dependency (the mark is drawn as
vector paths), then turned into Android resources by `@capacitor/assets`.

---

## Sharing

The share area on the results screen offers the native share sheet (which lists Instagram, Facebook,
WhatsApp and everything else installed), direct links for X / WhatsApp / Facebook / Telegram, a
text-only share, a **generated 1080×1350 PNG result card** you can post to Instagram, and a
copy-to-clipboard fallback.

The card draws the game that was played: a survivor streak as the list of artists beaten, and a
knockout as the **bracket itself**, with each duel's winner over the artist it knocked out and
connectors meeting where two duels feed the next round. The results screen draws the same tree with
the same geometry — `shared/bracket-board.ts` owns the maths (`bracketCentre`, `bracketJoins`) and
the screen renders it as CSS percentages while the card renders it in canvas, so the picture you
share cannot disagree with the bracket you just played. Neither shows a per-duel "Out in the …"
line: the tree already says it, and the space is better spent on the names. The card's middle line
names the format the same way the game does — `BRACKET` for a knockout, `BEAT n ARTISTS` for a
survivor streak — because a bare count says nothing about how the game was won.

Set the store link so link-based shares can be pre-filled:

```ts
// src/environments/environment.ts and environment.prod.ts
playStoreUrl: 'https://play.google.com/store/apps/details?id=YOUR_APP_ID',
```

While it is empty, Facebook and Telegram fall back to the native share sheet, which is the normal
path on Android anyway. Instagram has no web endpoint for pre-filled text, so it always goes through
the share sheet with the card image — that is the only route that actually works.

---

## Verification

```bash
npm run test:ci     # unit + render tests
npm run lint
npm run build
```

**156 tests** across 15 files. The suite covers the standard rules (round cap, one newcomer per
round, no repeats, champion never eliminated), the bracket rules (15 duels in a last-16 knockout, the
field halving every stage, stage names, winners carrying forward, the final crowning the champion),
the bracket layout (four stages of 8/4/2/1 duels, the tree ending at the champion, every beaten
artist appearing exactly once, stage names matching the results wording), the Spotify links (id
resolution, the embed and artist URLs, search-URL encoding, the malformed-id guard, the open/search
fallback), catalogue integrity across all 600 acts (clean slugs, unique ids and names, one genre each, enough
artists per genre), photo resolution and its generated-art fallback, route guards, the artwork
helpers, the share caption in both formats, the credits screen, and renders every page to assert it
shows the right thing — including that the player section sits directly above the share section. The
share **card** is covered too: with jsdom's missing canvas replaced by a recording double, the tests
assert that a knockout card draws every duel of the tree and a streak card draws the list.

The generated Spotify ids are checked against Spotify itself:

```bash
node scripts/verify-spotify-ids.mjs 60   # size of the sample; pass the full count to check all
```

It asks Spotify's public oEmbed endpoint what each artist id actually is and compares the answer
with the catalogue name. The last run sampled 60 ids spread across the map and all 60 matched, which
is what makes it safe to ship ids read from a wiki.

### Not verified here

- **The native Android build.** This machine has no JDK or Android SDK, so `./gradlew` was never
  run. `npx cap sync android` succeeds; assembling the AAB and testing on a device must happen where
  Android Studio (JDK 21+, Android SDK 36) is installed.
- **Sharing on a real device.** The share sheet, `@capacitor/share` file payloads and haptics were
  not exercised on hardware. In a browser they fall back to the Web Share API, then a download, then
  the clipboard.
- **A real browser walkthrough.** Rendering is asserted by DOM tests and the served bundles were
  checked over HTTP, but no browser automation was available.
- **The Spotify player itself.** The ids, the URLs and the DOM are verified, but the iframe was never
  loaded in a browser: whether Spotify's player renders and plays — and how much plays inside the
  Android WebView — needs a human on a real screen.
- **Photo licence review by a human.** The build filters and records licences programmatically; the
  residual personality-rights question in `docs/PHOTO_CREDITS.md` is for a lawyer, not a script.

See [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md) for the submission checklist and
[`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md) for the privacy policy template.
