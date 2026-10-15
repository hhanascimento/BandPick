/**
 * Attribution for one bundled photo.
 *
 * The Creative Commons licences the photos are used under require credit, a
 * licence reference and an indication of changes. This shape carries everything
 * the credits screen needs to comply; the records themselves are generated from
 * Wikimedia Commons metadata by `scripts/build-catalogue.mjs`.
 *
 * Kept as a hand-written model (rather than living in the generated file) so the
 * credits UI can be written and type-checked independently of a data refresh.
 */
export interface PhotoCredit {
  /** Artist id, matching the game's slug for that artist. */
  readonly artistId: string;
  /** The artist depicted, as shown in the game. */
  readonly artistName: string;
  /** Photographer or rights holder to credit. */
  readonly author: string;
  /** Title of the photograph as recorded on Commons. */
  readonly title: string;
  /** Short licence name, e.g. "CC BY-SA 4.0". */
  readonly licence: string;
  /** Link to the licence text. */
  readonly licenceUrl: string;
  /** Commons file page, for verification and for finding the source. */
  readonly sourceUrl: string;
}
