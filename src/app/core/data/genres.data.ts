/**
 * Public entry point for the bundled artist catalogue.
 *
 * The data is generated from Wikidata by `scripts/build-catalogue.mjs` and
 * committed, so the app builds, ships and runs entirely offline — no API keys,
 * no rate limits, no runtime network calls.
 *
 * To change the catalogue, edit the generator and re-run it; do not hand-edit
 * `catalogue.generated.ts`.
 */
export { GENRES, findGenre } from './catalogue.generated';
