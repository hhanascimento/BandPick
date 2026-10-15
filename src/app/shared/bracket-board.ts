import type { Artist } from '../core/models/artist.model';
import type { GameResult } from '../core/models/game.model';

/** One decided duel, as a bracket cell shows it: who went through, who went out. */
export interface BracketDuel {
  /** Stage number, so a cell can be placed without re-reading the raw matchups. */
  readonly round: number;
  /** 'Quarter-final', 'Semi-final', … */
  readonly stageName: string;
  /** The artist that advanced. */
  readonly winner: Artist;
  /** The artist knocked out by that win. */
  readonly loser: Artist;
}

/** A stage of the knockout: its name and every duel played in it. */
export interface BracketColumn {
  readonly round: number;
  readonly name: string;
  readonly duels: readonly BracketDuel[];
}

/** The whole knockout, laid out stage by stage. */
export interface BracketBoard {
  /** How many artists entered. */
  readonly size: number;
  /** Total duels played — 15 in a 16-artist bracket. */
  readonly ties: number;
  readonly champion: Artist;
  /** From the opening round to the final, in order. */
  readonly columns: readonly BracketColumn[];
}

/**
 * Where one duel sits vertically, in units of the whole board: 0 is the top edge
 * and 1 the bottom, so a consumer can draw it as a fraction of its own height —
 * a CSS percentage on screen, a canvas coordinate on the share card.
 */
export function bracketCentre(column: number, index: number, firstRound: number): number {
  return (2 ** column * (index + 0.5)) / firstRound;
}

/**
 * A join between two stages: the two duels that feed the next one, and where
 * the winner lands. All three are {@link bracketCentre} values.
 */
export interface BracketJoin {
  /** 0-based column the two feeding duels are in. */
  readonly column: number;
  /** Centre of the upper feeding duel. */
  readonly upper: number;
  /** Centre of the lower feeding duel. */
  readonly lower: number;
  /** Centre of the duel they feed. */
  readonly target: number;
}

type BoardSource = Pick<GameResult, 'format' | 'bracket' | 'matchups' | 'champion'>;

/**
 * Turns the flat duel history into bracket columns.
 *
 * The game records matchups in play order with a stage number on each, so the
 * tree can be rebuilt without storing any bracket geometry: stage 1 is the eight
 * ties of a round of 16, stage 2 the four quarter-finals, and so on down to the
 * final, whose winner is the champion.
 *
 * Deliberately a plain function rather than a service: both the results screen
 * and the share card need this shape, and deriving it once means the picture the
 * player shares cannot disagree with the bracket they see on screen.
 *
 * Returns `null` for standard (gauntlet) games, which have no bracket.
 */
export function bracketBoard(result: BoardSource): BracketBoard | null {
  const details = result.bracket;
  if (result.format !== 'bracket' || !details) {
    return null;
  }

  const columns: BracketColumn[] = [];
  for (const stage of details.stages) {
    const duels = result.matchups
      .filter((matchup) => matchup.round === stage.number)
      .map<BracketDuel>((matchup) => ({
        round: matchup.round,
        stageName: stage.name,
        winner: matchup.winner,
        loser: matchup.loser,
      }));

    // A stage with no duels only exists mid-game, when the results screen is not
    // reachable yet; skipping it keeps a finished board free of empty columns.
    if (duels.length > 0) {
      columns.push({ round: stage.number, name: stage.name, duels });
    }
  }

  if (columns.length === 0) {
    return null;
  }

  return {
    size: details.size,
    ties: columns.reduce((total, column) => total + column.duels.length, 0),
    champion: result.champion,
    columns,
  };
}

/**
 * Every join in the tree: one per duel after the opening round, each joining the
 * two duels that produced its two artists.
 *
 * This is what draws the bracket rather than merely listing it. The property
 * that makes it read as a bracket is that a join's `target` is exactly halfway
 * between `upper` and `lower` — the winner's box sits opposite the pair it came
 * from.
 */
export function bracketJoins(board: BracketBoard): readonly BracketJoin[] {
  const firstRound = board.columns[0]?.duels.length ?? 0;
  if (firstRound === 0) {
    return [];
  }

  const joins: BracketJoin[] = [];
  for (let column = 0; column < board.columns.length - 1; column++) {
    const duels = board.columns[column].duels;
    // Duels are played in pairs: 0 and 1 feed the next stage's first duel.
    for (let index = 0; index < duels.length; index += 2) {
      joins.push({
        column,
        upper: bracketCentre(column, index, firstRound),
        lower: bracketCentre(
          column,
          Math.min(index + 1, duels.length - 1),
          firstRound,
        ),
        target: bracketCentre(column + 1, index / 2, firstRound),
      });
    }
  }
  return joins;
}

/**
 * The same joins grouped by the gap they occupy: group `n` sits between column
 * `n` and column `n + 1`, which is how the results screen renders them.
 */
export function bracketJoinsByGap(board: BracketBoard): readonly (readonly BracketJoin[])[] {
  const groups: BracketJoin[][] = Array.from(
    { length: Math.max(0, board.columns.length - 1) },
    () => [],
  );
  for (const join of bracketJoins(board)) {
    groups[join.column]?.push(join);
  }
  return groups;
}
