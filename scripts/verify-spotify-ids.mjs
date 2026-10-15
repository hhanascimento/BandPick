/**
 * Verifies the generated Spotify ids against Spotify itself.
 *
 * For a spread of catalogue artists it asks Spotify's public oEmbed endpoint what
 * `open.spotify.com/artist/<id>` actually is, and reports any id whose Spotify
 * name does not look like the catalogue name. Run from the repo root:
 *
 *   node scripts/verify-spotify-ids.mjs [sampleSize]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sampleSize = Number(process.argv[2] ?? 40);

const generated = await readFile(
  path.join(ROOT, 'src/app/core/data/artist-spotify.generated.ts'),
  'utf8',
);
const catalogue = await readFile(path.join(ROOT, 'src/app/core/data/catalogue.generated.ts'), 'utf8');

const idBody = generated.slice(generated.indexOf('= {') + 3, generated.indexOf('};'));
const ids = new Map(
  [...idBody.matchAll(/'([^']+)': '([^']+)'/g)].map((match) => [match[1], match[2]]),
);
const names = new Map(
  [...catalogue.matchAll(/^\s+'([^']+)',$/gm)].map((match) => [match[1], match[1]]),
);

const normalise = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Evenly spread across the whole map rather than the first N, so the sample is
// not all one genre.
const entries = [...ids.entries()];
const step = Math.max(1, Math.floor(entries.length / sampleSize));
const sample = entries.filter((_, index) => index % step === 0).slice(0, sampleSize);

let ok = 0;
const mismatches = [];

for (const [slug, id] of sample) {
  try {
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(
      `https://open.spotify.com/artist/${id}`,
    )}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BandPickCatalogueBuilder/1.0 (catalogue verification)' },
    });
    const payload = await response.json();
    const spotifyName = normalise(payload.title ?? '');
    const catalogueName = normalise(names.get(slug) ?? slug);
    const looksRight =
      spotifyName.length > 0 &&
      (spotifyName.includes(catalogueName) ||
        catalogueName.includes(spotifyName) ||
        spotifyName.split(' ').some((word) => word.length > 3 && catalogueName.includes(word)));
    if (looksRight) {
      ok++;
    } else {
      mismatches.push({ slug, id, spotify: payload.title, http: response.status });
    }
  } catch (error) {
    mismatches.push({ slug, id, error: error.message });
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.log(`checked ${sample.length} ids: ${ok} matched, ${mismatches.length} to review`);
for (const mismatch of mismatches) {
  console.log(
    `  ${mismatch.slug}: spotify="${mismatch.spotify ?? mismatch.error}" (${mismatch.id})`,
  );
}
