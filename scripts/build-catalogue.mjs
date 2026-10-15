#!/usr/bin/env node
/**
 * Builds the bundled artist catalogue — names, genre membership, photos and the
 * attribution records needed to display them lawfully.
 *
 * Source of truth is **Wikidata** (artists, their P136 genre, their P18 image)
 * and **Wikimedia Commons** (the image itself plus its licence metadata). This is
 * deliberate: unlike the music APIs, Commons files carry explicit, verifiable
 * licences, so the photos can legally ship inside the app.
 *
 * The output is committed, so the app itself never touches the network and builds
 * offline. Re-run only to refresh the catalogue.
 *
 *   node scripts/build-catalogue.mjs fetch      # SPARQL -> .catalogue/artists-<genre>.json
 *   node scripts/build-catalogue.mjs licences   # Commons API -> .catalogue/licences.json
 *   node scripts/build-catalogue.mjs solo       # solo artists only -> .catalogue/solo.json
 *   node scripts/build-catalogue.mjs knownfor   # musicians only -> .catalogue/known-for.json
 *   node scripts/build-catalogue.mjs entitytype # people vs acts -> .catalogue/entity-type.json
 *   node scripts/build-catalogue.mjs assign     # one genre per act -> .catalogue/genre-assignment.json
 *   node scripts/build-catalogue.mjs spotify    # Spotify artist ids -> .catalogue/spotify.json
 *   node scripts/build-catalogue.mjs download   # images -> src/assets/artists/
 *   node scripts/build-catalogue.mjs prune      # drop images no longer referenced
 *   node scripts/build-catalogue.mjs generate   # -> src/app/core/data/*.generated.ts
 *   node scripts/build-catalogue.mjs all
 *
 * Flags: --limit=N (artists per genre), --genres=a,b,c, --refresh
 *
 * The catalogue is a **band game**: an entry Wikidata types as a musical act
 * (band, duo, trio, orchestra, collective) is kept, and a person is dropped
 * unless they are on the short hand-written household-name list in
 * HOUSEHOLD_SOLO_ARTISTS below. `fetch` records that type on every candidate,
 * and `selectArtists` is the single place the rule is applied, so the download,
 * Spotify and generate stages all follow it automatically.
 *
 * Wikidata/Commons etiquette (see docs/PHOTO_CREDITS.md): a meaningful
 * User-Agent with contact details is required, requests stay serial or
 * low-concurrency, and 429/503 responses are honoured with backoff.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, '.catalogue');
const IMAGE_DIR = path.join(ROOT, 'src/assets/artists');
const DATA_DIR = path.join(ROOT, 'src/app/core/data');

/**
 * Wikimedia's User-Agent policy requires a meaningful identifier, and asks for a
 * contact point. Do not hardcode a placeholder address here: Wikimedia
 * blocklists fake contacts such as `something@example.com` and answers those
 * requests with HTTP 403 "Please honor our robot policy".
 *
 * Set CATALOGUE_USER_AGENT to include your own contact when you run this, e.g.
 *   CATALOGUE_USER_AGENT='BandPickCatalogueBuilder/1.0 (you@yourdomain.com)' \
 *     node scripts/build-catalogue.mjs all
 */
const USER_AGENT =
  process.env.CATALOGUE_USER_AGENT ??
  'BandPickCatalogueBuilder/1.0 (offline build-time catalogue generator for the BandPick app)';

/**
 * Rendered by Wikimedia's thumbnailer, then re-encoded locally.
 *
 * Tiles show the photo at up to ~190 CSS px, so 400px stays crisp on a 2x display
 * while keeping roughly 600 bundled photos inside a sensible download size.
 */
const THUMB_WIDTH = 400;
const JPEG_QUALITY = 76;

/**
 * How many acts each genre ships.
 *
 * Selection is ranked by Wikidata sitelink count, so the top of a genre's list
 * is the acts with the most Wikipedia language editions — the most widely
 * recognised names. A hundred per genre reached far enough down that most of a
 * line-up was unfamiliar to an ordinary player, which is the opposite of what a
 * "who do you prefer" game wants. Fifty keeps each genre to names with a real
 * chance of being known.
 *
 * Fifty also leaves plenty of room above the 21 acts the longest survivor game
 * needs (20 rounds plus one) and the 16 a bracket needs, so every genre still
 * fills both formats.
 */
const TARGET_PER_GENRE = 50;

/**
 * Width asked of Wikimedia, which is deliberately not THUMB_WIDTH.
 *
 * Wikimedia only serves hotlinked thumbnails at its standard sizes — 120, 250,
 * 330, 500, 960, … (see w.wiki/GHai) — and refuses any other width. A refused
 * request comes back either as a 400 or as a 429 whose body tells you to use a
 * listed size. 500 is the smallest standard size that still covers the tile at
 * 2x, so every source image is fetched at 500 and then resized to THUMB_WIDTH.
 */
const SOURCE_THUMB_SIZE = 500;

// ---------------------------------------------------------------------------
// Genre definition. QIDs were verified against their English Wikipedia labels.
// ---------------------------------------------------------------------------

const GENRE_CONFIG = [
  { id: 'pop', name: 'Pop', blurb: 'Chart-toppers and radio favourites', emoji: '✨', qids: ['Q37073'] },
  { id: 'rock', name: 'Rock', blurb: 'Riffs, anthems and stadium legends', emoji: '🎸', qids: ['Q11399'] },
  { id: 'hip-hop', name: 'Hip-Hop & Rap', blurb: 'Bars, beats and culture', emoji: '🎤', qids: ['Q11401'] },
  {
    id: 'electronic',
    name: 'Electronic & Dance',
    blurb: 'Synths, drops and late-night floors',
    emoji: '🎛️',
    qids: ['Q9778', 'Q851213'],
  },
  {
    id: 'rnb-soul',
    name: 'R&B & Soul',
    blurb: 'Smooth vocals and deep grooves',
    emoji: '💜',
    qids: ['Q45981', 'Q131272'],
  },
  { id: 'metal', name: 'Metal', blurb: 'Heavy, fast and loud', emoji: '🤘', qids: ['Q38848'] },
  { id: 'country', name: 'Country', blurb: 'Storytelling, steel strings and heart', emoji: '🤠', qids: ['Q83440'] },
  { id: 'jazz', name: 'Jazz', blurb: 'Improvisation, swing and soul', emoji: '🎷', qids: ['Q8341'] },
  { id: 'reggae', name: 'Reggae', blurb: 'Island rhythm and positive vibration', emoji: '🌴', qids: ['Q9794'] },
  { id: 'latin', name: 'Latin', blurb: 'Ritmo, reggaetón and everything between', emoji: '🔥', qids: ['Q18345375', 'Q547137'] },
  {
    id: 'indie-alt',
    name: 'Indie & Alternative',
    blurb: 'Left-field favourites and cult classics',
    emoji: '🎧',
    qids: ['Q183504', 'Q11366'],
  },
  { id: 'k-pop', name: 'K-Pop', blurb: 'Idol groups and global hits', emoji: '💫', qids: ['Q213665'] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const stage = argv.find((a) => !a.startsWith('--')) ?? 'all';
const flag = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
};
const limit = Number(flag('limit') ?? TARGET_PER_GENRE);
const refresh = argv.includes('--refresh');
const onlyGenres = flag('genres')?.split(',').map((s) => s.trim()).filter(Boolean);

/** Matches the slug used by the app so image keys line up with artist ids. */
function slug(raw) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * Normalise an image URL into a Wikimedia thumbnail request at a standard size.
 *
 * Two shapes have to be handled. A URL that is already a thumbnail is repointed
 * at SOURCE_THUMB_SIZE, because Wikimedia rejects any width outside its
 * standard set. A bare path is the original upload, which is refused outright
 * for hotlinking clients; the Commons API returns that shape whenever the image
 * is narrower than the width asked for. A URL matching neither shape is
 * returned untouched.
 */
function thumbnailUrl(url, width = SOURCE_THUMB_SIZE) {
  const clean = (url ?? '').split('?')[0];
  if (!clean) return clean;

  const existing = clean.match(/^(.*\/thumb\/)(.+?)\/\d+px-(.+)$/);
  if (existing) {
    const [, prefix, shards, file] = existing;
    return `${prefix}${shards}/${width}px-${file}`;
  }

  const match = clean.match(
    /^(https?:\/\/[^/]+)\/wikipedia\/([^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/,
  );
  if (!match) return clean;

  const [, host, project, shard1, shard2, file] = match;
  return `${host}/wikipedia/${project}/thumb/${shard1}/${shard2}/${file}/${width}px-${file}`;
}

/**
 * Fetch with retries. Wikimedia asks clients to back off on 429/503 and to
 * respect `Retry-After` rather than hammering the endpoint.
 */
async function fetchWithRetry(
  url,
  { attempts = 5, label = '', onThrottle, maxWaitMs = 60_000 } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });

      // 502/504 come from WDQS's gateway when a query overruns the deadline:
      // transient, so they are worth retrying rather than aborting a long stage.
      if ([429, 502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const requested =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 2 ** attempt * 1000;
        // Honour Retry-After, but cap it. Some responses ask for ten minutes,
        // which would stall the build on a single file; slowing the overall
        // request rate is the more useful response to being throttled.
        const waitMs = Math.min(maxWaitMs, requested);
        console.warn(
          requested > maxWaitMs
            ? `  ${label} HTTP ${response.status}; Retry-After asked ${Math.round(requested / 1000)}s, capping at ${Math.round(waitMs / 1000)}s`
            : `  ${label} HTTP ${response.status}; waiting ${Math.round(waitMs / 1000)}s`,
        );
        onThrottle?.();
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${label || url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(Math.min(20_000, 2 ** attempt * 500));
    }
  }
  throw lastError ?? new Error(`Failed after ${attempts} attempts: ${label || url}`);
}

/**
 * Fetch JSON, backing off when the endpoint is unhappy.
 *
 * Wikimedia's API throttles with an HTML body ("You are making too many requests
 * to the API") and a 200 status, so a bare response.json() throws a SyntaxError
 * part-way through a long stage and loses the work. A non-JSON body is treated as
 * throttling and retried, honouring Retry-After when the response is a 429.
 */
async function fetchJson(url, label, { attempts = 6, maxWaitMs = 60_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if ([429, 502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const requested =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        const waitMs = Math.min(maxWaitMs, requested);
        console.log(`  ${label} HTTP ${response.status}; waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${label}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        const waitMs = Math.min(maxWaitMs, 2 ** attempt * 2000);
        console.log(`  ${label} throttled (non-JSON body); waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(Math.min(20_000, 2 ** attempt * 500));
    }
  }
  throw lastError ?? new Error(`Failed after ${attempts} attempts: ${label}`);
}

function stripHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Licence gate.
 *
 * Accepts CC0 / public domain and any Creative Commons Attribution licence
 * (including ShareAlike, which only binds adaptations of the image — the app
 * itself is unaffected). Rejects NonCommercial and NoDerivatives, which are not
 * usable here.
 */
function isAllowedLicence({ shortName = '', usageTerms = '', licence = '' }) {
  const haystack = `${shortName} ${usageTerms} ${licence}`.toLowerCase();

  if (/(nc|non-?commercial)/.test(haystack) && !/cc0/.test(haystack)) {
    return false;
  }
  if (/(\bnd\b|no-?deriv)/.test(haystack)) {
    return false;
  }
  if (/cc0|public domain|pdm|no restrictions/.test(haystack)) {
    return true;
  }
  return /\bcc[ -]?by\b|\bcc-by\b/.test(haystack);
}

/**
 * Solo artists who stay even though the catalogue is bands-only.
 *
 * BandPick is a knockout between bands, so an entry Wikidata types as a person
 * is dropped — a solo singer in the bracket reads as a mistake, and it is what
 * the player is here to avoid. A handful of solo artists are such household
 * names that leaving them out would look like a bug rather than a rule, so they
 * are named here and kept.
 *
 * This is a hand-written list on purpose. A notability cutoff cannot express
 * "household name": Ozzy Osbourne has 106 Wikipedia languages and Ed Sheeran
 * 94, while Johnny Depp has 147, Steven Seagal 127 and Mark Wahlberg 99. Any bar
 * that keeps the two singers also keeps the three actors, and any bar that drops
 * the actors also drops Sheeran. Only a named list says what is meant.
 *
 * Keyed by QID, so an upstream rename cannot silently drop an entry. Add or
 * remove names freely — this list is the only door a solo artist comes through,
 * so it is the one lever for how "bandy" the game feels.
 */
const HOUSEHOLD_SOLO_ENTRIES = [
  ['Q303', 'Elvis Presley', 'rock'],
  ['Q2831', 'Michael Jackson', 'pop'],
  ['Q1744', 'Madonna', 'pop'],
  ['Q5383', 'David Bowie', 'rock'],
  ['Q7542', 'Prince', 'rnb-soul'],
  ['Q2808', 'Elton John', 'pop'],
  ['Q1203', 'John Lennon', 'rock'],
  ['Q2599', 'Paul McCartney', 'rock'],
  ['Q392', 'Bob Dylan', 'rock'],
  ['Q1225', 'Bruce Springsteen', 'rock'],
  ['Q1514', 'Janis Joplin', 'rock'],
  ['Q8446', 'Kurt Cobain', 'rock'],
  ['Q128121', 'Mick Jagger', 'rock'],
  ['Q714', 'Stevie Wonder', 'rnb-soul'],
  ['Q125121', 'Aretha Franklin', 'rnb-soul'],
  ['Q131814', 'Tina Turner', 'rnb-soul'],
  ['Q34389', 'Whitney Houston', 'rnb-soul'],
  ['Q15897', 'Amy Winehouse', 'rnb-soul'],
  ['Q23215', 'Adele', 'pop'],
  ['Q47447', 'Ed Sheeran', 'pop'],
  ['Q26876', 'Taylor Swift', 'pop'],
  ['Q11975', 'Britney Spears', 'pop'],
  ['Q40912', 'Frank Sinatra', 'jazz'],
  ['Q42775', 'Johnny Cash', 'country'],
  ['Q206112', 'Willie Nelson', 'country'],
  ['Q409', 'Bob Marley', 'reggae'],
  ['Q483203', 'Sting', 'rock'],
  ['Q48187', 'Eric Clapton', 'rock'],
  ['Q12003', 'Cher', 'pop'],
  ['Q5105', 'Céline Dion', 'pop'],
  ['Q42455', 'Björk', 'electronic'],
  ['Q130311', 'George Michael', 'pop'],
  ['Q5608', 'Eminem', 'hip-hop'],
  ['Q6096', 'Snoop Dogg', 'hip-hop'],
  ['Q33240', 'Drake', 'hip-hop'],
  ['Q47122', 'Enrique Iglesias', 'latin'],
  ['Q122003', 'Julio Iglesias', 'latin'],
  ['Q966845', 'J Balvin', 'latin'],
  ['Q22001324', 'Karol G', 'latin'],
  ['Q13476301', 'Anitta', 'latin'],
  ['Q1779', 'Louis Armstrong', 'jazz'],
  ['Q93341', 'Miles Davis', 'jazz'],
  ['Q1768', 'Ella Fitzgerald', 'jazz'],
  ['Q104358', 'Billie Holiday', 'jazz'],
  ['Q174957', 'Nina Simone', 'jazz'],
  ['Q544387', 'Ray Charles', 'rnb-soul'],
  ['Q109063', 'Jimmy Cliff', 'reggae'],
  ['Q273049', 'Peter Tosh', 'reggae'],
  ['Q310763', 'Shaggy', 'reggae'],
  ['Q505476', 'Avicii', 'electronic'],
  ['Q16845512', 'Kygo', 'electronic'],
  ['Q133151', 'Ozzy Osbourne', 'metal'],
  ['Q185151', 'Ronnie James Dio', 'metal'],
  ['Q309926', 'Lemmy', 'metal'],
  ['Q165911', 'Usher', 'rnb-soul'],
  ['Q44857', 'John Legend', 'rnb-soul'],
  ['Q216288', 'Garth Brooks', 'country'],
  ['Q131433', 'Shania Twain', 'country'],    ['Q217160', 'Kenny Rogers', 'country'],
    ['Q229430', 'Reba McEntire', 'country'],
    // Jazz, the one genre where the household name and the band pull apart. The
    // canon is overwhelmingly soloists — Ellington, Basie, Coltrane and Parker
    // were bandleaders whose groups are named after them — so a bands-only rule
    // left Jazz showing six famous names and forty-four groups nobody has heard
    // of. These are the jazz names a general player recognises.
    ['Q4030', 'Duke Ellington', 'jazz'],
    ['Q107008', 'Count Basie', 'jazz'],
    ['Q7346', 'John Coltrane', 'jazz'],
    ['Q103767', 'Charlie Parker', 'jazz'],
    ['Q109612', 'Thelonious Monk', 'jazz'],
    ['Q49575', 'Dizzy Gillespie', 'jazz'],
    ['Q105875', 'Herbie Hancock', 'jazz'],
    ['Q108597', 'Dave Brubeck', 'jazz'],
    ['Q46755', 'Benny Goodman', 'jazz'],
    ['Q103651', 'Glenn Miller', 'jazz'],
    ['Q44122', 'Django Reinhardt', 'jazz'],
    ['Q105349', 'Oscar Peterson', 'jazz'],
    ['Q208205', 'Bill Evans', 'jazz'],
    ['Q137042', 'Nat King Cole', 'jazz'],
    ['Q2274', 'Chet Baker', 'jazz'],
    ['Q229513', 'Sarah Vaughan', 'jazz'],
    ['Q299208', 'Sonny Rollins', 'jazz'],
    ['Q30587', 'Stan Getz', 'jazz'],
  ];

/**
 * QID -> the household-name solo artist, and the one genre they sit in.
 *
 * The genre is spelled out rather than inferred. These are precisely the entries
 * whose Wikidata item carries several genre statements — Elvis Presley is filed
 * under pop, rock, R&B and country — so a rule would have to guess, and the list
 * exists because a human decided they belong here anyway.
 */
const HOUSEHOLD_SOLO_ARTISTS = new Map(
  HOUSEHOLD_SOLO_ENTRIES.map(([qid, name, genre]) => [qid, { name, genre }]),
);

/**
 * Which genre an act belongs to when it qualifies for more than one.
 *
 * Every act appears in exactly one genre. A knockout run picks a genre and then
 * plays that genre's acts, so an act filed under two genres shows up twice in
 * the same pool of names and makes the two genres overlap — The Beatles in both
 * Pop and Rock reads as a bug, not a feature.
 *
 * Most acts never need this: 4,158 of the 4,574 eligible ones carry a genre
 * statement for a single bucket. The 416 that carry several are settled by the
 * first genre in this list that they qualify for. The order is narrow-before-
 * broad: a band whose item also names a narrower genre reads as that genre
 * (a nu-metal act is not filed as pop just because it charted), with `pop` last
 * because "also has a pop statement" describes most crossovers and says the
 * least, and `k-pop`, `rock` and `metal` first because those are the genres
 * whose identity survives contact with the others.
 */
const GENRE_PRECEDENCE = [
  'k-pop',
  'rock',
  'metal',
  'indie-alt',
  'hip-hop',
  'electronic',
  'rnb-soul',
  'reggae',
  'jazz',
  'country',
  'latin',
  'pop',
];

/**
 * Acts whose genre the precedence order above would get wrong.
 *
 * Only needed where an act qualifies for several genres and the order picks the
 * wrong one — a pop duo whose item also carries a rock statement, say. Keyed by
 * QID. This is the list to extend when a favourite lands somewhere odd; the
 * review export (`.catalogue/export-review.mjs`) prints every multi-genre act so
 * the corrections are easy to spot.
 */
const PRIMARY_GENRE_OVERRIDES = new Map(
  [
    ['Q223495', 'The Carpenters', 'pop'],
    // Wikidata files Linkin Park under "nu metal", which is not the QID the Metal
    // pool queries, so without this the band lands in Indie & Alternative.
    ['Q261', 'Linkin Park', 'metal'],
    ['Q58381', 'Duran Duran', 'rock'],
    // Radiohead is filed under alternative rock, Britpop and several art-rock
    // strands, and the precedence order reads rock before indie — fine for a
    // crossover, but the band belongs in Indie & Alternative.
    ['Q44190', 'Radiohead', 'indie-alt'],
  ].map(([qid, , genre]) => [qid, genre]),
);

/**
 * Is this entry one the catalogue is allowed to show?
 *
 * Bands are the point, so a musical act always qualifies. A person has to be on
 * the household-name list above. An entry the fetch has not typed yet counts as
 * allowed, so the selection still works if the candidate files predate the type
 * field.
 */
function isBandCatalogueEntry(artist) {
  if (HOUSEHOLD_SOLO_ARTISTS.has(artist.qid)) return true;
  if (!artist.type) return true;
  return artist.type === 'act';
}

/**
 * The artists a genre will actually show: most notable first, each id once.
 *
 * The download stage and the generator must both select through this function.
 * When they disagreed, the run spent its Wikimedia request budget downloading
 * photos for artists the catalogue never displayed, and shipped the files.
 *
 * Four rules can reject a candidate:
 *   bandsOnly  — a person who is not on the household-name list
 *   solo       — a band member with no catalogue of their own
 *   knownFor   — an entry whose own article says they are known for something else
 *   genre      — an act whose single genre (see stageAssign) is a different one
 *
 * The QID-keyed verdicts treat an absent entry as "not classified yet" rather
 * than "rejected", so the selection still works when those stages have not been
 * run. The band rule reads the type recorded at fetch time, and the genre rule
 * is skipped entirely when no assignment has been computed.
 */
function selectArtists(
  artists,
  take,
  { solo = null, knownFor = null, assignment = null, genreId = null } = {},
) {
  const unique = [];
  const seen = new Set();
  for (const artist of [...artists].sort((a, b) => b.sitelinks - a.sitelinks)) {
    if (seen.has(artist.id)) continue;
    if (!isBandCatalogueEntry(artist)) continue;
    // One genre per act: this genre only shows the acts assigned to it.
    if (assignment && assignment[artist.qid] !== genreId) continue;
    // `solo` and `knownFor` are the stageSolo() and stageKnownFor() verdicts,
    // keyed by QID. Absent means "not classified yet", which keeps the selection
    // usable without those stages. A household name skips both: the solo rule is
    // about career band members with nothing of their own, which is exactly what
    // Kurt Cobain and Lemmy look like on paper, and the list is the human
    // override for that.
    if (!HOUSEHOLD_SOLO_ARTISTS.has(artist.qid)) {
      if (solo && solo[artist.qid]?.solo === false) continue;
      if (knownFor && knownFor[artist.qid]?.musical === false) continue;
    }
    seen.add(artist.id);
    unique.push(artist);
    if (unique.length >= take) break;
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Stage 1 — artists + genre + image filename from Wikidata
// ---------------------------------------------------------------------------

function artistQuery(qids, take, withSubgenres, kind = 'all') {
  const values = qids.map((qid) => `wd:${qid}`).join(' ');
  const genrePath = withSubgenres ? 'wdt:P136/wdt:P279*' : 'wdt:P136';

  // A musical act is any subclass of musical group (band, duo, trio, orchestra,
  // collective); `Q5` is a human. Naming the two apart lets the band pool be
  // queried on its own — see candidateRows().
  const typePattern =
    kind === 'act'
      ? '?artist wdt:P31/wdt:P279* wd:Q215380 .'
      : kind === 'person'
        ? '?artist wdt:P31 wd:Q5 .'
        : '  { ?artist wdt:P31 wd:Q5 . }\n  UNION\n  { ?artist wdt:P31/wdt:P279* wd:Q215380 . }';

  // Note: an occupation property path (`wdt:P106/wdt:P279* wd:Q639669`) was
  // measured at ~13s per query against a 60s WDQS deadline, so it is left out.
  // Requiring a genre statement (P136) plus an image (P18) already restricts
  // these to musical acts, and the sitelink ordering floats the notable ones up.
  return `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>

SELECT DISTINCT ?artist ?artistLabel ?image ?sitelinks WHERE {
  VALUES ?genre { ${values} }
  ${typePattern}
  ?artist ${genrePath} ?genre ;
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${take}`;
}

/**
 * How many acts to ask for per genre.
 *
 * The catalogue is a band game, so the band pool is what has to be deep. Bands
 * are not rare on Wikidata — the sitelink ordering is what hid them: people and
 * acts used to share one `LIMIT`, and a jazz query that returned the top 300
 * entries by Wikipedia-language count came back with eight groups, because a
 * hundred soloists outranked every big band. Acts are therefore queried on
 * their own, with a budget generous enough to fill a genre even after the
 * licence filter and the musicality filter have had their say.
 */
const ACT_LIMIT = 600;

/**
 * Direct genre matching is roughly six times faster on WDQS than walking the
 * subclass tree, so try it first and only broaden when a narrow genre cannot
 * fill the target.
 *
 * Each row is tagged with whether it came back as a person or an act, which
 * lets the fetch stage record the entity type without a second round of `P31`
 * lookups over thousands of candidates.
 */
async function candidateRows(genre, take) {
  const asAct = (rows) => rows.map((row) => ({ ...row, kind: 'act' }));
  const asPerson = (rows) => rows.map((row) => ({ ...row, kind: 'person' }));

  const people = await sparql(artistQuery(genre.qids, take, false, 'person'), `${genre.id} direct`);
  let acts = await sparql(artistQuery(genre.qids, ACT_LIMIT, false, 'act'), `${genre.id} acts`);

  // A genre whose own statement is rare (Latin, for one) needs the subclass tree
  // to reach its acts at all.
  if (acts.length < 150) {
    await sleep(2000);
    try {
      const broader = await sparql(
        artistQuery(genre.qids, ACT_LIMIT, true, 'act'),
        `${genre.id} acts + subgenres`,
      );
      if (broader.length > acts.length) acts = broader;
    } catch (error) {
      console.warn(`  ${genre.id}: act subgenre query failed (${error.message})`);
    }
  }

  let peopleRows = people;
  if (people.length < Math.min(take, 120)) {
    await sleep(2000);
    try {
      const broader = await sparql(
        artistQuery(genre.qids, take, true, 'person'),
        `${genre.id} + subgenres`,
      );
      if (broader.length > people.length) peopleRows = broader;
    } catch (error) {
      console.warn(`  ${genre.id}: subgenre query failed (${error.message}); keeping direct results`);
    }
  }

  return [...asPerson(peopleRows), ...asAct(acts)];
}

async function sparql(query, label) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url, { label });
  const payload = await response.json();
  return payload.results?.bindings ?? [];
}

/** Wikidata can return an artist whose English label is missing (the QID itself). */
function isUsableArtistLabel(label, qid) {
  if (!label || label === qid) return false;
  if (/^Q\d+$/.test(label)) return false;
  // Filter list articles and bare disambiguation noise.
  if (/^(list of|index of|categories)/i.test(label)) return false;
  return label.length >= 2 && label.length <= 60;
}

async function stageFetch() {
  await mkdir(WORK, { recursive: true });
  const genres = onlyGenres ? GENRE_CONFIG.filter((g) => onlyGenres.includes(g.id)) : GENRE_CONFIG;
  const output = {};

  for (const genre of genres) {
    const cacheFile = path.join(WORK, `artists-${genre.id}.json`);
    if (!refresh && existsSync(cacheFile)) {
      output[genre.id] = await readJson(cacheFile, []);
      console.log(`${genre.id.padEnd(12)} cached: ${output[genre.id].length} candidates`);
      continue;
    }

    // Ask for a generous multiple so the licence filter still leaves us enough.
    const take = Math.max(limit * 3, 150);
    const rows = await candidateRows(genre, take);

    // An artist can have several P18 images; keep the candidates per artist.
    const byArtist = new Map();
    const absorb = (qid, name, row) => {
      const fileUrl = row.image.value;
      const filename = decodeURIComponent(
        fileUrl.replace(/^.*Special:FilePath\//, ''),
      ).replace(/_/g, ' ');

      const entry = byArtist.get(qid) ?? {
        qid,
        name,
        id: slug(name),
        sitelinks: Number(row.sitelinks?.value ?? 0),
        images: [],
        // 'act' for a musical group, 'person' for a human. This is what lets the
        // catalogue be restricted to bands without asking Wikidata again.
        type: row.kind === 'act' ? 'act' : 'person',
      };
      if (row.kind === 'act') entry.type = 'act';
      if (!entry.images.includes(filename)) entry.images.push(filename);
      byArtist.set(qid, entry);
    };

    const labelLess = new Map();
    for (const row of rows) {
      const qid = row.artist.value.replace('http://www.wikidata.org/entity/', '');
      const label = row.artistLabel?.value ?? '';
      if (isUsableArtistLabel(label, qid)) {
        absorb(qid, label, row);
        continue;
      }
      const held = labelLess.get(qid) ?? [];
      held.push(row);
      labelLess.set(qid, held);
    }

    // A QID is not a name a player can read, so rows that came back label-less
    // are held aside instead of dropped: their English Wikipedia article is the
    // English name Wikidata itself points at. Radiohead has no English label at
    // all, and was being lost from the Indie pool for exactly that reason.
    if (labelLess.size) {
      let titles = new Map();
      try {
        titles = await enwikiTitles([...labelLess.keys()]);
      } catch (error) {
        console.warn(`  ${genre.id}: enwiki title lookup failed (${error.message})`);
      }
      let recovered = 0;
      for (const [qid, title] of titles) {
        if (!isUsableArtistLabel(title, qid)) continue;
        for (const row of labelLess.get(qid) ?? []) absorb(qid, title, row);
        recovered++;
      }
      if (recovered) {
        console.log(
          `  ${genre.id.padEnd(12)} ${recovered} named from their English Wikipedia title`,
        );
      }
      const lost = labelLess.size - recovered;
      if (lost) {
        console.log(`  ${genre.id.padEnd(12)} ${lost} dropped: no usable English name`);
      }
    }

    const artists = [...byArtist.values()].sort((a, b) => b.sitelinks - a.sitelinks);
    output[genre.id] = artists;
    await writeJson(cacheFile, artists);
    const acts = artists.filter((a) => a.type === 'act').length;
    console.log(
      `${genre.id.padEnd(12)} fetched: ${artists.length} artists (${acts} acts, ${artists.length - acts} people)`,
    );
    await sleep(1500);
  }

  console.log('\ndone.');
}

// ---------------------------------------------------------------------------
// Stage 2 — licence metadata for every candidate image
// ---------------------------------------------------------------------------

/** Commons allows batching many titles into one `titles=` request. */
async function licenceBatch(titles) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=LicenseShortName|UsageTerms|LicenseUrl|Artist|Credit|ObjectName|Restrictions' +
    `&iiurlwidth=${SOURCE_THUMB_SIZE}` +
    `&titles=${encodeURIComponent(titles.map((t) => `File:${t}`).join('|'))}`;

  const response = await fetchWithRetry(url, { label: `licences (${titles.length} files)` });
  const payload = await response.json();
  const pages = payload.query?.pages ?? {};
  const result = new Map();

  for (const page of Object.values(pages)) {
    if (page.missing !== undefined || !page.title) continue;
    const info = page.imageinfo?.[0];
    if (!info) continue;

    const meta = info.extmetadata ?? {};
    const value = (key) => stripHtml(meta[key]?.value ?? '');
    const filename = page.title.replace(/^File:/, '');

    result.set(filename, {
      shortName: value('LicenseShortName'),
      usageTerms: value('UsageTerms'),
      licenceUrl: value('LicenseUrl'),
      artist: value('Artist') || value('Credit') || 'Unknown author',
      credit: value('Credit'),
      title: value('ObjectName') || filename,
      restrictions: value('Restrictions'),
      thumbUrl: thumbnailUrl(info.thumburl ?? info.url ?? ''),
      descriptionUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
    });
  }

  return result;
}

async function stageLicences() {
  const genres = onlyGenres ? GENRE_CONFIG.filter((g) => onlyGenres.includes(g.id)) : GENRE_CONFIG;

  // Only the artists that can actually make the cut need checking, with a little
  // headroom so a bad licence on the first choice is not fatal. Checking every
  // candidate would mean thousands of Commons requests for nothing.
  const headroom = Math.ceil(limit * 1.25);
  const solo = await readJson(path.join(WORK, 'solo.json'), null);
  const knownFor = await readJson(path.join(WORK, 'known-for.json'), null);
  const assignment = await readJson(path.join(WORK, 'genre-assignment.json'), null);
  const wanted = new Set();
  for (const genre of genres) {
    const candidates = await readJson(path.join(WORK, `artists-${genre.id}.json`), []);
    for (const artist of selectArtists(candidates, headroom, {
      solo,
      knownFor,
      assignment,
      genreId: genre.id,
    })) {
      for (const filename of artist.images.slice(0, 2)) wanted.add(filename);
    }
  }

  const all = [...wanted];
  console.log(`${all.length} candidate images to check`);

  const cacheFile = path.join(WORK, 'licences.json');
  const cached = refresh ? {} : (await readJson(cacheFile, {})) ?? {};
  const pending = all.filter((f) => !(f in cached));

  const BATCH = 40;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    try {
      const found = await licenceBatch(batch);
      for (const filename of batch) {
        cached[filename] = found.get(filename) ?? { missing: true };
      }
    } catch (error) {
      console.error(`  batch ${i / BATCH + 1} failed: ${error.message}`);
      for (const filename of batch) cached[filename] = { missing: true };
    }

    if ((i / BATCH) % 5 === 0) {
      await writeJson(cacheFile, cached);
      console.log(`  checked ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
    }
    await sleep(400);
  }

  await writeJson(cacheFile, cached);

  const distribution = new Map();
  for (const meta of Object.values(cached)) {
    if (meta.missing) continue;
    const key = meta.shortName || '(blank)';
    distribution.set(key, (distribution.get(key) ?? 0) + 1);
  }

  console.log('\nlicence distribution found:');
  for (const [name, count] of [...distribution.entries()].sort((a, b) => b[1] - a[1])) {
    const allowed = isAllowedLicence({
      shortName: name,
      usageTerms: '',
      licence: '',
    });
    console.log(`  ${String(count).padStart(5)}  ${name}${allowed ? '' : '   [EXCLUDED]'}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — keep only artists who are known as solo artists
// ---------------------------------------------------------------------------

/**
 * Wikidata models someone as a musical artist whether they front a band or
 * perform under their own name, so a genre query alone drags in people who are
 * only known as members of a group — Lemmy, Jim Morrison, Bon Scott. Set beside
 * genuine solo acts those read as mistakes, so they are filtered out here.
 *
 * Someone is dropped only when every one of these says "band member":
 *
 *   excluded = is in at least one group
 *              AND has fewer than BAND_MEMBER_ALBUM_FLOOR albums of their own
 *              AND appears as the performer on fewer than SOLO_RELEASE_FLOOR items
 *
 * Anyone with a solo catalogue stays even if they also led a band: Sting (30
albums), Ozzy Osbourne (30), Phil Collins (22), Bruce Dickinson (17). Someone
 * who never joined a group stays too, which protects soloists whose Wikidata
 * item is thin.
 *
 * The third test is what saves modern solo artists whose releases are mostly
 * singles rather than albums — Lisa (1 album, 24 releases) and Jennie (1 album,
 * 20) are solo acts, while Bon Scott (0 albums, 6) and Bono (0, 7) are band
 * members. Album counts alone cannot tell those four apart.
 *
 * The counts are cached by QID, so adding artists or re-running costs only the
 * new look-ups.
 */
const BAND_MEMBER_ALBUM_FLOOR = 3;

/** Any kind of release credited to them as performer — the singles-heavy safety net. */
const SOLO_RELEASE_FLOOR = 10;

/**
 * QIDs per request, sized by measurement: 50 artists answer in ~260ms once the
 * album classes are matched explicitly (see soloAlbumCounts), so a full catalogue
 * of ~2,700 candidates classifies in about a minute and a half.
 */
const SOLO_BATCH = 50;

const valuesClause = (qids) => qids.map((qid) => `wd:${qid}`).join(' ');

/**
 * Albums Wikidata credits directly to the artist.
 *
 * Matching `P31` against album and studio album explicitly, rather than walking
 * the `P279*` subclass tree, is what makes this stage viable: measured against
 * the same 50 artists, the subclass walk overran WDQS's 60s deadline (HTTP 504)
 * while this answers in ~260ms. Singles and EPs are deliberately left out —
 * counting those would break the band-member test below by crediting a sideman
 * with his group's releases.
 */
async function soloAlbumCounts(batch) {
  const rows = await sparql(
    `SELECT ?artist (COUNT(DISTINCT ?album) AS ?n) WHERE {
  VALUES ?artist { ${valuesClause(batch)} }
  ?album wdt:P175 ?artist ; wdt:P31 ?kind .
  VALUES ?kind { wd:Q482994 wd:Q208569 }
}
GROUP BY ?artist`,
    `solo albums (${batch.length})`,
  );
  return new Map(rows.map((row) => [row.artist.value.split('/').pop(), Number(row.n.value)]));
}

/**
 * Everything Wikidata credits to the artist as a performer, of any kind.
 *
 * Deliberately unconstrained by release type: this is the breadth test, so it
 * counts songs, singles, EPs and albums alike.
 */
async function soloReleaseCounts(batch) {
  const rows = await sparql(
    `SELECT ?artist (COUNT(DISTINCT ?release) AS ?n) WHERE {
  VALUES ?artist { ${valuesClause(batch)} }
  ?release wdt:P175 ?artist .
}
GROUP BY ?artist`,
    `solo releases (${batch.length})`,
  );
  return new Map(rows.map((row) => [row.artist.value.split('/').pop(), Number(row.n.value)]));
}

/** How many groups the artist is a member of (P463). */
async function soloBandMemberships(batch) {
  const rows = await sparql(
    `SELECT DISTINCT ?artist ?band WHERE {
  VALUES ?artist { ${valuesClause(batch)} }
  ?artist wdt:P463 ?band .
}`,
    `solo memberships (${batch.length})`,
  );
  const counts = new Map();
  for (const row of rows) {
    const qid = row.artist.value.split('/').pop();
    counts.set(qid, (counts.get(qid) ?? 0) + 1);
  }
  return counts;
}

async function stageSolo() {
  const qids = new Set();
  const byQid = new Map();
  for (const genre of GENRE_CONFIG) {
    for (const artist of await readJson(path.join(WORK, `artists-${genre.id}.json`), [])) {
      qids.add(artist.qid);
      if (!byQid.has(artist.qid)) byQid.set(artist.qid, artist);
    }
  }

  const all = [...qids];
  console.log(`${all.length} candidate artists on record`);

  const cacheFile = path.join(WORK, 'solo.json');
  const cached = refresh ? {} : ((await readJson(cacheFile, {})) ?? {});
  const pending = all.filter((qid) => !(qid in cached));

  if (pending.length) {
    console.log(`${pending.length} to classify, ${SOLO_BATCH} per request`);
    // Persist after every batch: a 504 part-way through then costs one batch, not
    // the whole run, and the stage is resumable from the cache.
    for (let i = 0; i < pending.length; i += SOLO_BATCH) {
      const batch = pending.slice(i, i + SOLO_BATCH);
      const albums = await soloAlbumCounts(batch);
      const releases = await soloReleaseCounts(batch);
      const memberships = await soloBandMemberships(batch);
      for (const qid of batch) {
        const ownAlbums = albums.get(qid) ?? 0;
        const ownReleases = releases.get(qid) ?? 0;
        const bands = memberships.get(qid) ?? 0;
        cached[qid] = {
          ownAlbums,
          ownReleases,
          memberships: bands,
          solo:
            bands === 0 ||
            ownAlbums >= BAND_MEMBER_ALBUM_FLOOR ||
            ownReleases >= SOLO_RELEASE_FLOOR,
        };
      }
      await writeJson(cacheFile, cached);
      console.log(`  classified ${Math.min(i + SOLO_BATCH, pending.length)}/${pending.length}`);
      await sleep(1200);
    }
  } else {
    console.log('every candidate is already classified');
  }

  const dropped = all
    .filter((qid) => cached[qid]?.solo === false)
    .map((qid) => byQid.get(qid))
    .filter(Boolean)
    .sort((a, b) => b.sitelinks - a.sitelinks);

  console.log(
    `\n${dropped.length} of ${all.length} candidates are group members without a solo catalogue`,
  );
  console.log('most notable exclusions, worth eyeballing for false positives:');
  for (const artist of dropped.slice(0, 25)) {
    const verdict = cached[artist.qid];
    console.log(
      `  ${artist.name} (${artist.qid}) albums=${verdict.ownAlbums}` +
        ` releases=${verdict.ownReleases} bands=${verdict.memberships}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Stage 4 — keep acts whose own entry says they make music
// ---------------------------------------------------------------------------

/**
 * Why this stage exists.
 *
 * A genre statement plus a photo is not proof of being a musician. Wikidata has
 * a P136 genre for anyone who ever released a record, so the catalogue filled up
 * with people who are famous for something else entirely — Hulk Hogan (one
 * novelty album), Shaquille O'Neal (a basketball career with a rap album on the
 * side) — and, because selection ranks by sitelink count, being very famous made
 * them beat actual musicians into the top 100.
 *
 * A notability cutoff cannot fix that: Hogan has 81 Wikipedia languages and Shaq
 * 85, more than most real bands. What separates them is what they are known for,
 * which is exactly what the first sentence of their own article says. So an
 * artist stays when their opening sentence names a musical role.
 *
 *   "Metallica is an American heavy metal band."                     -> keep
 *   "...is an American professional wrestler and media personality."  -> drop
 *   "Drake is a Canadian rapper, singer and actor."                   -> keep
 *   "...is an American former professional basketball player..."      -> drop
 *
 * An entry with no English Wikipedia article is kept: the rule only drops what it
 * can positively identify as something other than a musician.
 *
 * Wikidata occupations were measured as a fallback and rejected. Hogan's own item
 * lists guitarist, rapper and record producer alongside professional wrestler, so
 * occupations cannot tell a novelty single from a career — the prose can, because
 * it says what the subject is known for.
 */
const MUSICAL_ROLES = [
  'act',
  'band',
  'boy band',
  'boyband',
  'girl group',
  'group',
  'supergroup',
  'project',
  'music project',
  'sound system',
  'duo',
  'trio',
  'quartet',
  'quintet',
  'sextet',
  'orchestra',
  'ensemble',
  'collective',
  'tribute band',
  'musician',
  'singer',
  'singer-songwriter',
  'songwriter',
  'vocalist',
  'rapper',
  'deejay',
  'dj',
  'turntablist',
  'beatmaker',
  'composer',
  'guitarist',
  'guitar player',
  'drummer',
  'bassist',
  'pianist',
  'keyboardist',
  'saxophonist',
  'clarinetist',
  'flautist',
  'trumpeter',
  'trombonist',
  'violinist',
  'cellist',
  'organist',
  'harpist',
  'percussionist',
  // Instrument names as well as the -ist nouns: articles write "a Jamaican
  // trumpet and saxophone player" and "a Malian kora player".
  'saxophone',
  'trumpet',
  'trombone',
  'clarinet',
  'flute',
  'fiddle',
  'kora',
  'steelpan',
  'instrumentalist',
  'multi-instrumentalist',
  'accordionist',
  'bandleader',
  'frontman',
  'frontwoman',
  'crooner',
  'soprano',
  'mezzo-soprano',
  'tenor',
  'baritone',
  // 'producer' alone would keep a celebrity film producer, so it is qualified.
  'music producer',
  'record producer',
  'recording artist',
  'record artist',
  'record executive',
  'disc jockey',
];

/**
 * Genre words, for the "a genre word plus artist" shape.
 *
 * Plenty of entries describe themselves as "a Jamaican dancehall artist" or "an
 * Italian reggae artist" without naming a role from the list above, and those are
 * exactly the artists this stage must not throw away.
 */
const MUSIC_GENRE =
  /\b(music|musical|rock|pop|jazz|blues|reggae|dub|dancehall|rocksteady|soul|funk|hip[- ]hop|rap|country|folk|metal|punk|electronic|house|techno|disco|classical|opera|latin|salsa|cumbia|bachata|k[- ]?pop|afrobeat|ska|gospel|grunge|indie|ambient|swing|bebop|calypso|highlife|zouk|flamenco|tango|bolero|ranchera|reggaeton|dubstep|trance|drill|trap|soca|samba|bossa|chanson|schlager|qawwali|ghazal|morna|kizomba|makossa)\b/;

/**
 * Nouns that, next to a music word, identify a performer.
 *
 * "an Argentine-Spanish music artist", "an Estonian hip-hop act", "a Belgian
 * electronic music project", "a Belgian pioneer in pop music" — all musicians,
 * none of which names a role from the list above.
 */
const PERFORMER_NOUN =
  /\b(artist|singer|musician|performer|group|band|act|project|duo|trio|dj|rapper|vocalist|music)\b/;

/**
 * A full stop that belongs to an abbreviation, not to the end of the sentence.
 *
 * "...known by his stage name Dr. Alban, is an Albanian-Swedish musician" used to
 * be cut at "Dr.", which hid the words that identify the artist and dropped a
 * genuine musician from the catalogue.
 */
const ABBREVIATIONS =
  /\b(Dr|Mr|Mrs|Ms|St|Jr|Sr|Prof|Rev|Gen|Col|Capt|Lt|Sgt|vs|No|Mt|Ft|Inc|Ltd|Co|vol|approx|est)\./gi;

/**
 * The opening sentence of an article.
 *
 * Parenthetical asides (pronunciation, birth and death dates) are removed first,
 * and a period after a single letter is not a sentence end — otherwise
 * "John R. Cash (…) was an American country singer" is cut off before the part
 * that says what he is known for, and a household name gets dropped.
 */
function openingSentence(extract) {
  const withoutAsides = extract.replace(/\([^)]*\)/g, ' ');
  const sentence =
    withoutAsides
      .replace(ABBREVIATIONS, '$1\u0000')
      .split(/(?<!\b[A-Z])\.\s+(?=[A-Z])/)[0] ?? '';
  return sentence.replace(/\u0000/g, '.').replace(/\s+/g, ' ').trim();
}

/**
 * Does the sentence say what this entry is known for making?
 *
 * Two shapes count: a named musical role ("is an American singer-songwriter"),
 * or a music word beside a performer noun ("is an Italian reggae artist",
 * "were a Jamaican harmony group", "a pioneer in pop music").
 *
 * Roles are matched with an optional plural, because articles say "harmony
 * groups" and "backing bands" as often as the singular.
 */
function sentenceNamesMusician(sentence) {
  const lower = sentence.toLowerCase();
  if (MUSICAL_ROLES.some((role) => new RegExp(`\\b${role}s?\\b`).test(lower))) return true;
  return MUSIC_GENRE.test(lower) && PERFORMER_NOUN.test(lower);
}

/** English Wikipedia titles for a batch of QIDs, so extracts can be fetched in bulk. */
async function enwikiTitles(batch) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks' +
    `&sitefilter=enwiki&ids=${batch.join('|')}`;
  const payload = await fetchJson(url, `enwiki titles (${batch.length})`);
  return new Map(
    Object.entries(payload.entities ?? {})
      .map(([qid, entity]) => [qid, entity.sitelinks?.enwiki?.title])
      .filter(([, title]) => Boolean(title)),
  );
}

/** Intro extracts for a batch of article titles, keyed by title. */
async function enwikiExtracts(batch) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts' +
    '&exintro=1&explaintext=1&exlimit=20&redirects=1' +
    `&titles=${encodeURIComponent(batch.join('|'))}`;
  const payload = await fetchJson(url, `enwiki extracts (${batch.length})`);
  return new Map(
    Object.values(payload.query?.pages ?? {})
      .filter((page) => page.extract)
      .map((page) => [page.title, page.extract]),
  );
}

async function stageKnownFor() {
  const qids = new Set();
  for (const genre of GENRE_CONFIG) {
    for (const artist of await readJson(path.join(WORK, `artists-${genre.id}.json`), [])) {
      qids.add(artist.qid);
    }
  }

  const all = [...qids];
  const cacheFile = path.join(WORK, 'known-for.json');
  const cached = refresh ? {} : ((await readJson(cacheFile, {})) ?? {});
  const pending = all.filter((qid) => !(qid in cached));
  console.log(
    `${all.length} candidates on record, ${pending.length} still to look up`,
  );

  // The raw intro text is cached on its own, keyed by QID. Adjusting the
  // vocabulary below then costs no Wikipedia requests at all — which matters,
  // because the API throttles an unattended bulk read hard.
  const extractsFile = path.join(WORK, 'extracts.json');
  const rawExtracts = refresh ? {} : ((await readJson(extractsFile, {})) ?? {});

  // Titles are cached separately: they never change, and a re-run with a
  // changed vocabulary must not re-ask Wikidata for the same sitelinks.
  const titlesFile = path.join(WORK, 'enwiki-titles.json');
  const titles = refresh
    ? {}
    : ((await readJson(titlesFile, {})) ?? {});
  const needTitles = all.filter((qid) => !(qid in titles));
  for (let i = 0; i < needTitles.length; i += 40) {
    const batch = needTitles.slice(i, i + 40);
    const found = await enwikiTitles(batch);
    for (const qid of batch) {
      titles[qid] = found.get(qid) ?? null;
    }
    await writeJson(titlesFile, titles);
    console.log(`  titles ${Math.min(i + 40, needTitles.length)}/${needTitles.length}`);
    await sleep(300);
  }

  const byTitle = new Map();
  for (const qid of pending) {
    const title = titles[qid];
    if (title && !byTitle.has(title)) byTitle.set(title, qid);
  }
  const uniqueTitles = [...byTitle.keys()];
  console.log(`${uniqueTitles.length} articles on record`);

  // Articles already read are reused, so changing the vocabulary below re-reads
  // nothing. The rest are fetched in batches and written after each one.
  const extracts = new Map();
  for (const qid of pending) {
    const title = titles[qid];
    if (title && rawExtracts[qid]) extracts.set(title, rawExtracts[qid]);
  }
  const toRead = uniqueTitles.filter((title) => !extracts.has(title));
  console.log(`${toRead.length} articles to read, ${uniqueTitles.length - toRead.length} cached`);

  for (let i = 0; i < toRead.length; i += 20) {
    const batch = toRead.slice(i, i + 20);
    const found = await enwikiExtracts(batch);
    for (const [title, extract] of found) {
      extracts.set(title, extract);
    }
    for (const qid of pending) {
      const title = titles[qid];
      if (title && extracts.has(title)) rawExtracts[qid] = extracts.get(title);
    }
    await writeJson(extractsFile, rawExtracts);
    console.log(`  extracts ${Math.min(i + 20, toRead.length)}/${toRead.length}`);
    await sleep(400);
  }

  for (const qid of pending) {
    const title = titles[qid];
    const extract = title ? extracts.get(title) : undefined;
    const sentence = extract ? openingSentence(extract) : '';
    cached[qid] = {
      title: title ?? null,
      sentence,
      // No prose means no evidence against the entry, so it stays.
      musical: sentence ? sentenceNamesMusician(sentence) : true,
      source: sentence ? 'article' : 'none',
    };
  }
  await writeJson(cacheFile, cached);

  const keptForLackOfProse = all.filter((qid) => cached[qid]?.source === 'none').length;
  console.log(`${keptForLackOfProse} candidates have no usable article and are kept`);

  const dropped = all
    .filter((qid) => cached[qid]?.musical === false)
    .map((qid) => ({ qid, ...cached[qid] }))
    .sort((a, b) => (a.sentence || a.qid).localeCompare(b.sentence || b.qid));

  console.log(
    `\n${dropped.length} of ${all.length} candidates are not known for making music`,
  );
  const report = dropped.map((entry) => `${entry.qid}\t${entry.source}\t${entry.title ?? '-'}\t${entry.sentence}`);
  await writeFile(
    path.join(WORK, 'known-for-drops.txt'),
    `${report.join('\n')}\n`,
    'utf8',
  );
  console.log('full drop list written to .catalogue/known-for-drops.txt; first 20:');
  for (const entry of dropped.slice(0, 20)) {
    console.log(`  ${entry.title ?? entry.qid}: ${entry.sentence.slice(0, 96) || '(no article)'}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 4b — people vs acts
// ---------------------------------------------------------------------------

/** P31 classes that mean "this entry is a musical act" rather than a person. */
const ACT_CLASSES = [
  'Q215380', // musical group
  'Q2088357', // musical ensemble
  'Q641066', // band
  'Q9212979', // musical duo
  'Q1141476', // musical collective
  'Q7623892', // musical trio
  'Q2405480', // musical quartet
];

/**
 * Whether a candidate is a person or an act, recorded for the build report.
 *
 * Nothing is filtered on this: the stage exists so the mix per genre can be
 * audited. It is the measure of how much of the catalogue is solo artists, which
 * is the number that moves when the musicality rule above is tightened.
 *
 * P31 is read directly (the SPARQL endpoint refuses a 900-item VALUES query with
 * a 503), then the class hierarchy is walked a few levels so a subclass of
 * musical group still counts.
 */
async function stageEntityType() {
  const qids = new Set();
  for (const genre of GENRE_CONFIG) {
    for (const artist of await readJson(path.join(WORK, `artists-${genre.id}.json`), [])) {
      qids.add(artist.qid);
    }
  }
  const all = [...qids];

  // Resumable: every answered batch is persisted, because the endpoint throttles
  // hard and a lost run must not mean a lost afternoon of requests.
  const claimsFile = path.join(WORK, 'p31.json');
  const cachedClaims = refresh ? {} : ((await readJson(claimsFile, {})) ?? {});
  const needP31 = all.filter((qid) => !(qid in cachedClaims));
  console.log(`${all.length} candidates, ${needP31.length} need a P31 lookup`);

  for (let i = 0; i < needP31.length; i += 25) {
    const batch = needP31.slice(i, i + 25);
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims' +
      `&ids=${batch.join('|')}`;
    try {
      const payload = await fetchJson(url, `P31 ${i}`);
      for (const qid of batch) {
        cachedClaims[qid] = (payload.entities?.[qid]?.claims?.P31 ?? [])
          .map((claim) => claim.mainsnak?.datavalue?.value?.id)
          .filter(Boolean);
      }
    } catch (error) {
      console.warn(`  batch ${i} failed (${error.message}); keeping what we have`);
      break;
    }
    await writeJson(claimsFile, cachedClaims);
    console.log(`  P31 ${Math.min(i + 25, needP31.length)}/${needP31.length}`);
    await sleep(900);
  }

  // The parent classes of everything seen so far, so a subclass resolves.
  const parentsFile = path.join(WORK, 'p279.json');
  const parents = refresh ? {} : ((await readJson(parentsFile, {})) ?? {});
  let frontier = [...new Set(Object.values(cachedClaims).flat())].filter(
    (qid) => !(qid in parents),
  );
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next = new Set();
    for (let i = 0; i < frontier.length; i += 25) {
      const batch = frontier.slice(i, i + 25);
      const url =
        'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims' +
        `&ids=${batch.join('|')}`;
      const payload = await fetchJson(url, `P279 ${i}`);
      for (const qid of batch) {
        const values = (payload.entities?.[qid]?.claims?.P279 ?? [])
          .map((claim) => claim.mainsnak?.datavalue?.value?.id)
          .filter(Boolean);
        parents[qid] = values;
        for (const value of values) if (!(value in parents)) next.add(value);
      }
      await writeJson(parentsFile, parents);
      await sleep(900);
    }
    frontier = [...next];
    console.log(`  hierarchy depth ${depth + 1}: ${frontier.length} more classes`);
  }

  function kindOf(qid) {
    const seen = new Set();
    const queue = [...(cachedClaims[qid] ?? [])];
    while (queue.length) {
      const cls = queue.shift();
      if (seen.has(cls)) continue;
      seen.add(cls);
      if (cls === 'Q5') return 'human';
      if (ACT_CLASSES.includes(cls)) return 'act';
      for (const parent of parents[cls] ?? []) queue.push(parent);
    }
    return 'other';
  }

  const result = {};
  for (const qid of all) result[qid] = kindOf(qid);
  await writeJson(path.join(WORK, 'entity-type.json'), result);

  const counts = { human: 0, act: 0, other: 0 };
  for (const value of Object.values(result)) counts[value]++;
  console.log(`\n${counts.human} people, ${counts.act} acts, ${counts.other} unclassified`);
  console.log('this does not filter anything; it reports how much of the catalogue is solo');
}

// ---------------------------------------------------------------------------
// Stage 4c — one genre per act
// ---------------------------------------------------------------------------

/**
 * Decides the single genre every act appears in, and records it.
 *
 * The per-genre candidate files overlap: an act with genre statements for two of
 * our buckets sits in both files, so selecting each genre independently shows
 * the same act in two line-ups. This stage resolves that once, up front, and
 * writes `.catalogue/genre-assignment.json` (QID -> genre id) for `selectArtists`
 * to filter on.
 *
 * The genre comes from, in order:
 *   1. the household-name list, which names a genre for every legend;
 *   2. PRIMARY_GENRE_OVERRIDES, for an act the precedence order gets wrong;
 *   3. GENRE_PRECEDENCE — the first genre in that order the act qualifies for.
 *
 * Run it after `solo` and `knownfor`: those verdicts decide which genres an act
 * qualifies for in the first place.
 */
async function stageAssign() {
  const solo = await readJson(path.join(WORK, 'solo.json'), null);
  const knownFor = await readJson(path.join(WORK, 'known-for.json'), null);

  // Which of the twelve genres each act qualifies for, after every other filter.
  const qualifies = new Map();
  const record = new Map();
  const pools = new Map();
  for (const genre of GENRE_CONFIG) {
    const candidates = await readJson(path.join(WORK, `artists-${genre.id}.json`), []);
    pools.set(genre.id, candidates);
    const seen = new Set();
    for (const artist of candidates) {
      if (seen.has(artist.id)) continue;
      seen.add(artist.id);
      if (!record.has(artist.qid)) record.set(artist.qid, artist);
      if (!isBandCatalogueEntry(artist)) continue;
      if (!HOUSEHOLD_SOLO_ARTISTS.has(artist.qid)) {
        if (solo && solo[artist.qid]?.solo === false) continue;
        if (knownFor && knownFor[artist.qid]?.musical === false) continue;
      }
      if (!qualifies.has(artist.qid)) qualifies.set(artist.qid, []);
      qualifies.get(artist.qid).push(genre.id);
    }
  }

  const singleBucket = [...qualifies.values()].filter((ids) => ids.length === 1).length;
  console.log(
    `${singleBucket} of ${qualifies.size} eligible acts are filed under exactly one bucket`,
  );

  const assignment = {};
  const placed = [];
  const missing = [];

  // The household-name list names a genre for every legend, and that is a human
  // decision rather than a deduction. Wikidata does not always agree: it files
  // Elton John under rock and R&B but never under pop, and Snoop Dogg under
  // reggae. When the chosen genre's pool does not contain the legend, put them
  // in it — they carry their photos and Spotify id with them, and the whole point
  // of the list is that the placement was chosen.
  const forcedPlacements = [
    ...[...HOUSEHOLD_SOLO_ARTISTS].map(([qid, entry]) => ({ qid, ...entry })),
    ...[...PRIMARY_GENRE_OVERRIDES].map(([qid, genre]) => ({
      qid,
      genre,
      name: record.get(qid)?.name ?? qid,
    })),
  ];
  for (const { qid, name, genre } of forcedPlacements) {
    const ids = qualifies.get(qid) ?? [];
    if (ids.includes(genre)) continue;
    const artist = record.get(qid);
    const pool = pools.get(genre);
    if (!artist || !pool) {
      missing.push(`${name}: no record to place in ${genre}`);
      continue;
    }
    if (!pool.some((entry) => entry.id === artist.id)) {
      pool.push(artist);
      await writeJson(path.join(WORK, `artists-${genre}.json`), pool);
    }
    if (!qualifies.has(qid)) qualifies.set(qid, []);
    qualifies.get(qid).push(genre);
    placed.push(`${name} -> ${genre} (Wikidata had: ${ids.join('/') || 'nothing'})`);
  }

  for (const [qid, ids] of qualifies) {
    const legend = HOUSEHOLD_SOLO_ARTISTS.get(qid);
    const override = PRIMARY_GENRE_OVERRIDES.get(qid);
    const preferred = legend?.genre ?? override;
    assignment[qid] =
      (preferred && ids.includes(preferred) ? preferred : undefined) ??
      GENRE_PRECEDENCE.find((id) => ids.includes(id)) ??
      ids[0];
  }
  await writeJson(path.join(WORK, 'genre-assignment.json'), assignment);

  const counts = Object.fromEntries(GENRE_CONFIG.map((g) => [g.id, 0]));
  for (const qid of Object.keys(assignment)) counts[assignment[qid]]++;
  console.log(`${Object.keys(assignment).length} acts assigned to exactly one genre`);
  for (const genre of GENRE_CONFIG) {
    const note = counts[genre.id] < limit ? '   [UNDER TARGET]' : '';
    console.log(`  ${genre.id.padEnd(12)} ${String(counts[genre.id]).padEnd(4)}${note}`);
  }
  if (placed.length) {
    console.log(`\n${placed.length} act(s) placed into a genre Wikidata does not list:`);
    for (const line of placed) console.log(`  ${line}`);
  }
  if (missing.length) {
    console.log(`\n${missing.length} legend(s) could not be placed:`);
    for (const line of missing) console.log(`  ${line}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 5 — Spotify artist ids, so the results screen can play the champion
// ---------------------------------------------------------------------------

/**
 * QIDs per request. Two properties are read per artist, so this stays at the
 * batch size the solo stage proved safe rather than pushing the query wider.
 */
const SPOTIFY_BATCH = 50;

/**
 * Spotify's own artist id, as Wikidata records it (P1902).
 *
 * This is what lets the app offer a real player for the champion with no API
 * key, no OAuth and no backend: Spotify ids are stable public identifiers, and
 * `open.spotify.com/embed/artist/<id>` is a player any web page may frame. The
 * alternative — Spotify's Web API — needs client credentials and a token, which
 * would mean the app could no longer open straight into a game offline.
 */
async function spotifyBatch(batch) {
  const rows = await sparql(
    `SELECT ?artist ?spotify WHERE {
  VALUES ?artist { ${valuesClause(batch)} }
  ?artist wdt:P1902 ?spotify .
}`,
    `spotify ids (${batch.length})`,
  );
  return new Map(rows.map((row) => [row.artist.value.split('/').pop(), row.spotify.value]));
}

/**
 * Spotify artist ids are 22 base-62 characters. Anything else is a bad Wikidata
 * edit, and it is dropped here rather than shipped: the app puts this value into
 * a URL and an iframe, so a malformed one would be a rendering bug at best.
 */
function isUsableSpotifyId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{22}$/.test(value);
}

async function stageSpotify() {
  const qids = new Set();
  for (const genre of GENRE_CONFIG) {
    for (const artist of await readJson(path.join(WORK, `artists-${genre.id}.json`), [])) {
      qids.add(artist.qid);
    }
  }

  const all = [...qids];
  const cacheFile = path.join(WORK, 'spotify.json');
  const cached = refresh ? {} : ((await readJson(cacheFile, {})) ?? {});
  const pending = all.filter((qid) => !(qid in cached));

  console.log(
    `${all.length} candidates on record, ${pending.length} still to look up (${SPOTIFY_BATCH} per request)`,
  );

  // A null means "asked, and this artist has no Spotify id" — cached so a second
  // run does not re-ask, and so re-runs stay cheap after adding artists.
  for (let i = 0; i < pending.length; i += SPOTIFY_BATCH) {
    const batch = pending.slice(i, i + SPOTIFY_BATCH);
    const found = await spotifyBatch(batch);
    for (const qid of batch) {
      const value = found.get(qid);
      cached[qid] = isUsableSpotifyId(value) ? value : null;
    }
    await writeJson(cacheFile, cached);
    console.log(`  looked up ${Math.min(i + SPOTIFY_BATCH, pending.length)}/${pending.length}`);
    await sleep(800);
  }

  const linked = all.filter((qid) => cached[qid]).length;
  console.log(`\n${linked} of ${all.length} candidates have a Spotify artist id`);
}

// ---------------------------------------------------------------------------
// Stage 6 — download + re-encode the chosen images
// ---------------------------------------------------------------------------

async function stageDownload() {
  const genres = onlyGenres ? GENRE_CONFIG.filter((g) => onlyGenres.includes(g.id)) : GENRE_CONFIG;
  const licences = await readJson(path.join(WORK, 'licences.json'), {});
  const solo = await readJson(path.join(WORK, 'solo.json'), null);
  const knownFor = await readJson(path.join(WORK, 'known-for.json'), null);
  const assignment = await readJson(path.join(WORK, 'genre-assignment.json'), null);
  await mkdir(IMAGE_DIR, { recursive: true });

  // Pick one licence-clean image per artist, per genre, best first.
  const chosen = new Map();
  const perGenre = [];

  for (const genre of genres) {
    const candidates = await readJson(path.join(WORK, `artists-${genre.id}.json`), []);
    const picked = [];

    // Only the artists the app will display: fetching photos for the rest would
    // download megabytes of assets no screen ever references.
    for (const artist of selectArtists(candidates, limit, {
      solo,
      knownFor,
      assignment,
      genreId: genre.id,
    })) {
      // One genre per act, so this is belt-and-braces: the photo is global, and
      // an act that somehow appeared twice must still download only once.
      if (chosen.has(artist.id)) continue;
      for (const filename of artist.images) {
        const meta = licences[filename];
        if (!meta || meta.missing || !meta.thumbUrl) continue;
        if (!isAllowedLicence(meta)) continue;
        const record = { artistId: artist.id, name: artist.name, filename, ...meta };
        chosen.set(artist.id, record);
        picked.push(record);
        break;
      }
    }

    perGenre.push(picked);
  }

  // Interleave the genres (rank 1 of each, then rank 2 of each, ...). A run that
  // is interrupted or throttled then leaves every genre with a similar number of
  // photos, instead of finishing Pop and never reaching K-Pop.
  const targets = [];
  const deepest = perGenre.reduce((max, list) => Math.max(max, list.length), 0);
  for (let rank = 0; rank < deepest; rank++) {
    for (const list of perGenre) {
      if (list[rank]) targets.push(list[rank]);
    }
  }

  console.log(`${targets.length} artists have a usable image`);

  let done = 0;
  let skipped = 0;
  const manifest = [];
  const failed = [];

  // Measured against the live thumbnail CDN: 450ms gaps draw sporadic 429s,
  // 1200ms gaps come back clean every time. Hold that pace and widen it further
  // whenever a throttle does appear.
  const baseDelay = 1200;
  let delay = baseDelay;

  for (const target of targets) {
    const output = path.join(IMAGE_DIR, `${target.artistId}.jpg`);
    if (!refresh && existsSync(output)) {
      manifest.push({ ...target, file: `assets/artists/${target.artistId}.jpg` });
      skipped++;
      continue;
    }

    try {
      // Try the thumbnail CDN first and keep the original file as a last resort:
      // utm_* tracking parameters are dropped, and a bare original path is
      // rewritten to its thumbnail (see thumbnailUrl) because originals are the
      // endpoint that throttles us.
      const urls = [
        ...new Set([thumbnailUrl(target.thumbUrl), target.thumbUrl.split('?')[0]]),
      ].filter(Boolean);

      let buffer;
      let lastError;
      for (const imageUrl of urls) {
        try {
          const response = await fetchWithRetry(imageUrl, {
            label: target.artistId,
            // Keep a single throttled file from stalling the whole pass: give up
            // after a few tries, record it as failed, and let a later run pick
            // it up (the pass skips files already on disk).
            attempts: 3,
            maxWaitMs: 30_000,
            onThrottle: () => {
              delay = Math.min(4000, Math.round(delay * 1.5));
            },
          });
          buffer = Buffer.from(await response.arrayBuffer());
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!buffer) throw lastError ?? new Error('no usable image URL');

      await sharp(buffer)
        .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(output);

      manifest.push({ ...target, file: `assets/artists/${target.artistId}.jpg` });
      done++;
      // Ease back towards the base gap after each good request. Throttling is
      // usually a burst response, so a delay that only ever escalates would
      // leave the rest of the run needlessly slow.
      delay = Math.max(baseDelay, Math.round(delay * 0.97));
      await sleep(delay);
    } catch (error) {
      failed.push(target.artistId);
      console.warn(`  ${target.artistId}: ${error.message}`);
    }

    // Checkpoint regularly: the manifest is what the generate stage reads, so a
    // partial run still produces a usable catalogue, and a re-run resumes.
    if ((done + skipped) % 50 === 0) {
      await writeJson(path.join(WORK, 'manifest.json'), manifest);
      await writeJson(path.join(WORK, 'failed.json'), failed);
      console.log(
        `  progress ${done + skipped}/${targets.length} (delay ${delay}ms, ${failed.length} failed)`,
      );
    }
  }

  await writeJson(path.join(WORK, 'manifest.json'), manifest);
  await writeJson(path.join(WORK, 'failed.json'), failed);
  console.log(`\ndownloaded ${done}, reused ${skipped}, manifest entries ${manifest.length}`);
}

// ---------------------------------------------------------------------------
// Stage 7 — remove image files the catalogue no longer references
// ---------------------------------------------------------------------------

/**
 * Downloads only ever add files. When the selection moves on — a different
 * per-genre limit, a better-licensed photo replacing an earlier pick, or a plain
 * re-fetch — the superseded file stays on disk and still ships in the app
 * bundle even though no screen references it. Anything the manifest does not
 * list is an orphan, so delete it.
 *
 * Safe by design: an empty or missing manifest means it cannot tell what is
 * still in use, so it refuses to delete anything.
 */
async function stagePrune({ dryRun = false } = {}) {
  const manifest = await readJson(path.join(WORK, 'manifest.json'), []);
  if (!manifest.length) {
    console.warn('manifest is empty; refusing to prune (run download first)');
    return;
  }

  const keep = new Set(manifest.map((entry) => path.basename(entry.file)));
  const files = existsSync(IMAGE_DIR) ? await readdir(IMAGE_DIR) : [];
  const orphans = files.filter((file) => !keep.has(file));

  let bytes = 0;
  for (const file of orphans) {
    const full = path.join(IMAGE_DIR, file);
    try {
      bytes += (await stat(full)).size;
      if (!dryRun) await rm(full, { force: true });
    } catch (error) {
      console.warn(`  could not remove ${file}: ${error.message}`);
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(
    dryRun
      ? `${orphans.length} orphan image(s) of ${files.length} (${mb} MB) — nothing removed (--dry-run)`
      : `pruned ${orphans.length} orphan image(s) of ${files.length}, reclaiming ${mb} MB`,
  );
}

// ---------------------------------------------------------------------------
// Stage 8 — emit the TypeScript the app imports
// ---------------------------------------------------------------------------

function tsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function stageGenerate() {
  const genres = GENRE_CONFIG;
  const licences = await readJson(path.join(WORK, 'licences.json'), {});
  const solo = await readJson(path.join(WORK, 'solo.json'), null);
  const knownFor = await readJson(path.join(WORK, 'known-for.json'), null);
  const spotify = await readJson(path.join(WORK, 'spotify.json'), {});
  const assignment = await readJson(path.join(WORK, 'genre-assignment.json'), null);
  const manifest = await readJson(path.join(WORK, 'manifest.json'), []);
  const manifestById = new Map(manifest.map((entry) => [entry.artistId, entry]));

  const genreBlocks = [];
  // Every act sits in exactly one genre, but the maps below are still keyed by
  // artist id and guarded, so a stray duplicate could never emit a duplicate key.
  const imageByArtist = new Map();
  const creditByArtist = new Map();
  const spotifyByArtist = new Map();

  for (const genre of genres) {
    const candidates = await readJson(path.join(WORK, `artists-${genre.id}.json`), []);

    // The same selection the download stage used, so every artist shown with a
    // photo is guaranteed to have that photo on disk.
    const unique = selectArtists(candidates, limit, {
      solo,
      knownFor,
      assignment,
      genreId: genre.id,
    });

    genreBlocks.push(`  {
    id: ${tsString(genre.id)},
    name: ${tsString(genre.name)},
    blurb: ${tsString(genre.blurb)},
    emoji: ${tsString(genre.emoji)},
    artists: artists([
${unique.map((a) => `      ${tsString(a.name)},`).join('\n')}
    ]),
  },`);

    for (const artist of unique) {
      const entry = manifestById.get(artist.id);
      if (!entry || imageByArtist.has(artist.id)) continue;
      imageByArtist.set(artist.id, entry.file);
      creditByArtist.set(
        artist.id,
        `  {
    artistId: ${tsString(artist.id)},
    artistName: ${tsString(entry.name)},
    author: ${tsString(entry.artist || 'Unknown author')},
    title: ${tsString(entry.title || entry.filename)},
    licence: ${tsString(entry.shortName || 'See source')},
    licenceUrl: ${tsString(entry.licenceUrl)},
    sourceUrl: ${tsString(entry.descriptionUrl)},
  },`,
      );
    }

    // Spotify ids are keyed by artist, not by genre: an artist that appears in
    // two genres must not produce a duplicate key in the generated map.
    for (const artist of unique) {
      const id = spotify[artist.qid];
      if (!isUsableSpotifyId(id) || spotifyByArtist.has(artist.id)) continue;
      spotifyByArtist.set(artist.id, id);
    }

    console.log(
      `${genre.id.padEnd(12)} ${unique.length} artists, ` +
        `${unique.filter((a) => imageByArtist.has(a.id)).length} with photos, ` +
        `${unique.filter((a) => spotifyByArtist.has(a.id)).length} with Spotify ids`,
    );
  }

  // Emit in a stable order so re-running the generator produces a clean diff.
  const imageEntries = [...imageByArtist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, file]) => `  ${tsString(id)}: ${tsString(file)},`);
  const creditEntries = [...creditByArtist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, record]) => record);
  const spotifyEntries = [...spotifyByArtist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, spotifyId]) => `  ${tsString(id)}: ${tsString(spotifyId)},`);

  const catalogue = `/* GENERATED by scripts/build-catalogue.mjs — do not edit by hand. */
import type { Artist } from '../models/artist.model';
import type { Genre } from '../models/genre.model';

/**
 * Turns a display name into a stable, accent-free id.
 * Must stay in step with the slug() used by scripts/build-catalogue.mjs, or the
 * photo keys will stop matching the artist ids.
 */
function slug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function artist(name: string): Artist {
  return { id: slug(name), name };
}

function artists(names: readonly string[]): readonly Artist[] {
  return names.map(artist);
}

/**
 * The bundled catalogue, generated from Wikidata: artists matched to a genre via
 * P136, ranked by sitelink count so the most notable come first.
 *
 * Bundled on purpose — the game must work offline with no API keys and no rate
 * limits. Photos are separate (see artist-images.generated.ts).
 */
export const GENRES: readonly Genre[] = [
${genreBlocks.join('\n')}
];

/** Look-up helper used by the setup screen and the results share text. */
export function findGenre(id: string): Genre | undefined {
  return GENRES.find((genre) => genre.id === id);
}
`;

  const images = `/* GENERATED by scripts/build-catalogue.mjs — do not edit by hand. */
import type { Artist } from '../models/artist.model';

/**
 * Artist photos bundled with the app.
 *
 * Every entry is a Wikimedia Commons file whose licence permits redistribution
 * (CC0, public domain, CC BY or CC BY-SA) — see artist-credits.generated.ts for
 * the attribution each one requires, surfaced in the in-app credits screen.
 *
 * Artists missing from this map fall back to generated artwork, so a gap never
 * leaves a blank tile.
 */
const IMAGES: Readonly<Record<string, string>> = {
${imageEntries.join('\n')}
};

/** Resolves the photo for an artist, or \`undefined\` to fall back to generated art. */
export function bundledImageFor(artist: Artist): string | undefined {
  return IMAGES[artist.id];
}

/** How many artists have a bundled photo — shown on the credits screen. */
export function photoCount(): number {
  return Object.keys(IMAGES).length;
}
`;

  const credits = `/* GENERATED by scripts/build-catalogue.mjs — do not edit by hand. */
import type { PhotoCredit } from '../models/photo-credit.model';

/**
 * Photo attribution, sorted by artist name.
 *
 * These credits are required by the licences the photos are used under and are
 * shown in the app's Credits screen. See docs/PHOTO_CREDITS.md for the policy.
 */
export const PHOTO_CREDITS: readonly PhotoCredit[] = [
${creditEntries.join('\n')}
].sort((a, b) => a.artistName.localeCompare(b.artistName));
`;

  const spotifyIds = `/* GENERATED by scripts/build-catalogue.mjs — do not edit by hand. */
import type { Artist } from '../models/artist.model';

/**
 * Spotify artist ids for the catalogue, resolved from Wikidata (P1902).
 *
 * These are public identifiers, so the app can hand one straight to
 * \`open.spotify.com/embed/artist/<id>\` and get a real player with no API key,
 * no OAuth and no network call of our own. Artists missing from this map still
 * get a \`open.spotify.com/search/<name>\` link, so the listen section is never a
 * dead end — see core/services/spotify.service.ts.
 *
 * Bundled rather than fetched, like the rest of the catalogue, so the app works
 * offline.
 */
const SPOTIFY_ARTIST_IDS: Readonly<Record<string, string>> = {
${spotifyEntries.join('\n')}
};

/** Spotify's artist id for an artist, or \`undefined\` when we have none. */
export function spotifyArtistIdFor(artist: Artist): string | undefined {
  return SPOTIFY_ARTIST_IDS[artist.id];
}
`;

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'catalogue.generated.ts'), catalogue, 'utf8');
  await writeFile(path.join(DATA_DIR, 'artist-images.generated.ts'), images, 'utf8');
  await writeFile(path.join(DATA_DIR, 'artist-credits.generated.ts'), credits, 'utf8');
  await writeFile(path.join(DATA_DIR, 'artist-spotify.generated.ts'), spotifyIds, 'utf8');
  console.log(
    '\nwrote catalogue.generated.ts, artist-images.generated.ts, artist-credits.generated.ts, artist-spotify.generated.ts',
  );
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(WORK, { recursive: true });

  if (stage === 'fetch' || stage === 'all') await stageFetch();
  if (stage === 'licences' || stage === 'all') await stageLicences();
  if (stage === 'solo' || stage === 'all') await stageSolo();
  if (stage === 'knownfor' || stage === 'all') await stageKnownFor();
  if (stage === 'entitytype' || stage === 'all') await stageEntityType();
  if (stage === 'assign' || stage === 'all') await stageAssign();
  if (stage === 'spotify' || stage === 'all') await stageSpotify();
  if (stage === 'download' || stage === 'all') await stageDownload();
  if (stage === 'prune') await stagePrune({ dryRun: argv.includes('--dry-run') });
  if (stage === 'generate' || stage === 'all') await stageGenerate();
  if (stage === 'clean') {
    await rm(WORK, { recursive: true, force: true });
    console.log('cleaned .catalogue/');
  }

  if (stage === 'stats') {
    const files = existsSync(IMAGE_DIR) ? await readdir(IMAGE_DIR) : [];
    console.log(`${files.length} bundled images`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
