/**
 * A band, or a household-name solo artist, that can appear on a BandPick tile.
 *
 * `image` is optional on purpose: when it is missing (or fails to load) the UI
 * falls back to a generated artwork tile built from the artist name, so the game
 * always looks intentional and never shows a broken image.
 *
 * See `core/data/artist-images.ts` for the drop-in convention used to attach
 * real photos once you have the rights to distribute them.
 */
export interface Artist {
  /** Stable slug generated from the name, e.g. `bob-marley-and-the-wailers`. */
  readonly id: string;
  /** Display name, always shown regardless of whether a photo exists. */
  readonly name: string;
  /** Optional photo: a bundled asset path (`assets/artists/foo.jpg`) or an absolute URL. */
  readonly image?: string;
}
