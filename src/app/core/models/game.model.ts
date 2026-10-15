import type { Artist } from './artist.model';
import type { Genre } from './genre.model';

/**
 * Which shape of game is being played.
 *
 * - `gauntlet` — the original survivor streak: your pick keeps its tile and a
 *   new challenger steps up, for as many rounds as you asked for.
 * - `bracket` — a single-elimination knockout. Every artist must lose once, and
 *   the last one standing takes the crown.
 */
export type GameFormat = 'gauntlet' | 'bracket';

/** One head-to-head decision the player made. */
export interface Matchup {
  /**
   * 1-based round number. For a bracket this is the stage number, so a
   * quarter-final decision is round 2 of a 16-artist bracket.
   */
  readonly round: number;
  /** Artist occupying the left tile. */
  readonly left: Artist;
  /** Artist occupying the right tile. */
  readonly right: Artist;
  /** The tile the player tapped — survives into the next round. */
  readonly winner: Artist;
  /** The tile the player did not pick — eliminated in this round. */
  readonly loser: Artist;
}

/** An artist that was knocked out, and when. */
export interface Elimination {
  readonly artist: Artist;
  /** Round in which the artist lost. Stage number when playing a bracket. */
  readonly round: number;
  /**
   * What that round was called in bracket play — 'Round of 16', 'Quarter-final',
   * 'Semi-final' or 'Final'. Unset for a gauntlet, which has no stage names.
   */
  readonly stageName?: string;
}

/** One knockout round of a bracket. */
export interface BracketStage {
  /** 1-based stage number. */
  readonly number: number;
  /** Display name, e.g. 'Quarter-final'. */
  readonly name: string;
  /** How many duels the stage contains. */
  readonly ties: number;
}

/** The bracket a game is being played in. */
export interface BracketDetails {
  /** How many artists entered — always a power of two. */
  readonly size: number;
  /** Every stage, in order, from the opening round to the final. */
  readonly stages: readonly BracketStage[];
}

/** Everything the results screen needs. */
export interface GameResult {
  readonly genre: Genre;
  readonly format: GameFormat;
  /**
   * How many duels the champion had to survive — the number of rounds the
   * player asked for in a gauntlet, or the number of stages in a bracket.
   */
  readonly totalRounds: number;
  /** Bracket play only: the entry count and stage names. */
  readonly bracket?: BracketDetails;
  /** The last artist standing. */
  readonly champion: Artist;
  /** Every artist the champion survived, in elimination order. */
  readonly eliminations: readonly Elimination[];
  /** The full round-by-round history. */
  readonly matchups: readonly Matchup[];
}

/** Which slot a tile occupies. Used so the champion's tile never jumps around. */
export type Side = 'left' | 'right';

/** The two artists currently facing off. */
export interface Pairing {
  readonly left: Artist;
  readonly right: Artist;
}

/**
 * Short description of what was played, shared by the results screen, the share
 * caption and the result card so the three can never disagree.
 *
 * '16-artist bracket' reads better than '4 rounds' for a knockout, and '4
 * rounds' is exactly right for a survivor streak.
 */
export function formatLabel(result: Pick<GameResult, 'format' | 'totalRounds' | 'bracket'>): string {
  return result.format === 'bracket' && result.bracket
    ? `${result.bracket.size}-artist bracket`
    : `${result.totalRounds} rounds`;
}

/**
 * The same thing again, phrased to sit inside a sentence: '12 rounds of Pop' or
 * 'a 16-artist Pop bracket'. Kept separate from {@link formatLabel} because "I
 * played a 12 rounds" is exactly the kind of sentence a single label produces.
 */
export function formatPhrase(
  result: Pick<GameResult, 'format' | 'totalRounds' | 'bracket' | 'genre'>,
): string {
  return result.format === 'bracket' && result.bracket
    ? `a ${result.bracket.size}-band ${result.genre.name} bracket`
    : `${result.totalRounds} rounds of ${result.genre.name}`;
}

/** When an artist went out, phrased for the format being played. */
export function eliminationLabel(elimination: Elimination): string {
  return elimination.stageName
    ? `Out in the ${elimination.stageName}`
    : `Out in round ${elimination.round}`;
}
