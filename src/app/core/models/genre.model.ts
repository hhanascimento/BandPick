import type { Artist } from './artist.model';

/** A music style the player can pick, together with the artists competing in it. */
export interface Genre {
  /** Stable identifier used in routes and state, e.g. `hip-hop`. */
  readonly id: string;
  /** English display name shown to the player. */
  readonly name: string;
  /** One-line description shown on the genre picker. */
  readonly blurb: string;
  /** Decorative emoji used on the genre cards. */
  readonly emoji: string;
  /**
   * Artists available in this genre. The game needs `rounds + 1` of them, so every
   * genre ships well above the `GameService.MAX_ROUNDS` maximum.
   */
  readonly artists: readonly Artist[];
}
