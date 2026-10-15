import { GENRES } from '../core/data/genres.data';
import type { GameResult } from '../core/models/game.model';
import { GameService } from '../core/services/game.service';
import {
  bracketBoard,
  bracketCentre,
  bracketJoins,
  bracketJoinsByGap,
} from './bracket-board';

const METAL = GENRES.find((genre) => genre.id === 'metal')!;

/** Plays a bracket to the end, always picking the left tile. */
function bracketResult(size: 8 | 16): GameResult {
  const game = new GameService();
  game.startBracket(METAL, size);
  while (game.status() === 'playing') {
    game.choose('left');
  }
  const result = game.result();
  if (!result) {
    throw new Error('Expected the bracket to finish with a result.');
  }
  return result;
}

describe('bracketBoard', () => {
  it('returns nothing for a survivor streak, which has no bracket', () => {
    const game = new GameService();
    game.start(METAL, 6);
    while (game.status() === 'playing') {
      game.choose('left');
    }

    expect(bracketBoard(game.result()!)).toBeNull();
  });

  it('lays a 16-artist knockout out as four stages of 8, 4, 2 and 1 duels', () => {
    const board = bracketBoard(bracketResult(16))!;

    expect(board.size).toBe(16);
    expect(board.ties).toBe(15);
    expect(board.columns.map((column) => column.name)).toEqual([
      'Round of 16',
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);
    expect(board.columns.map((column) => column.duels.length)).toEqual([8, 4, 2, 1]);
  });

  it('lays an 8-artist knockout out as three stages of 4, 2 and 1 duels', () => {
    const board = bracketBoard(bracketResult(8))!;

    expect(board.columns.map((column) => column.duels.length)).toEqual([4, 2, 1]);
    expect(board.ties).toBe(7);
  });

  it('ends the tree at the champion', () => {
    const result = bracketResult(16);
    const board = bracketBoard(result)!;
    const final = board.columns.at(-1)!;

    expect(final.name).toBe('Final');
    expect(final.duels[0].winner.id).toBe(result.champion.id);
    expect(board.champion.id).toBe(result.champion.id);
  });

  it('puts everyone the champion beat in the tree exactly once', () => {
    const result = bracketResult(16);
    const board = bracketBoard(result)!;
    const losers = board.columns.flatMap((column) =>
      column.duels.map((duel) => duel.loser.id),
    );

    expect(losers).toHaveLength(15);
    expect(new Set(losers).size).toBe(15);
    expect(losers).not.toContain(result.champion.id);
    expect(losers).toEqual(result.eliminations.map((elimination) => elimination.artist.id));
  });

  it('carries each stage name onto its duels', () => {
    const board = bracketBoard(bracketResult(8))!;
    const quarter = board.columns[0];

    expect(quarter.name).toBe('Quarter-final');
    expect(quarter.duels.every((duel) => duel.stageName === 'Quarter-final')).toBe(true);
  });
});

describe('bracketCentre', () => {
  it('splits the opening round into equal slots', () => {
    // Eight duels: the first sits an eighth of the way down, not at the very top.
    expect(bracketCentre(0, 0, 8)).toBeCloseTo(0.0625);
    expect(bracketCentre(0, 7, 8)).toBeCloseTo(0.9375);
  });

  it('halves the frequency at every later stage', () => {
    expect(bracketCentre(1, 0, 8)).toBeCloseTo(0.125);
    expect(bracketCentre(2, 0, 8)).toBeCloseTo(0.25);
    expect(bracketCentre(3, 0, 8)).toBeCloseTo(0.5);
  });
});

describe('bracketJoins', () => {
  it('has one join per duel after the opening round', () => {
    const board = bracketBoard(bracketResult(16))!;

    expect(bracketJoins(board)).toHaveLength(15 - 8);
  });

  it('puts each duel exactly halfway between the two that fed it', () => {
    const board = bracketBoard(bracketResult(16))!;

    for (const join of bracketJoins(board)) {
      expect(join.target).toBeCloseTo((join.upper + join.lower) / 2);
    }
  });

  it('runs a join from every pair up to the next stage', () => {
    const board = bracketBoard(bracketResult(8))!;
    const joins = bracketJoins(board);

    // Two semi-finalists out of four quarter-finals, then the final out of the
    // two semi-finals.
    expect(joins).toHaveLength(3);
    expect(joins[0]).toMatchObject({
      column: 0,
      upper: bracketCentre(0, 0, 4),
      lower: bracketCentre(0, 1, 4),
      target: bracketCentre(1, 0, 4),
    });
    expect(joins.at(-1)).toMatchObject({
      column: 1,
      upper: bracketCentre(1, 0, 4),
      lower: bracketCentre(1, 1, 4),
      target: bracketCentre(2, 0, 4),
    });
  });

  it('groups the joins by the gap they belong to', () => {
    const board = bracketBoard(bracketResult(8))!;
    const gaps = bracketJoinsByGap(board);

    // Three columns means two boundaries: 2 joins, then 1.
    expect(gaps).toHaveLength(2);
    expect(gaps.map((gap) => gap.length)).toEqual([2, 1]);
    expect(gaps[0].every((join) => join.column === 0)).toBe(true);
  });

  it('has no joins at all in a board of a single column', () => {
    const board = bracketBoard(bracketResult(8))!;
    const oneColumn = { ...board, columns: board.columns.slice(0, 1) };

    expect(bracketJoins(oneColumn)).toEqual([]);
    expect(bracketJoinsByGap(oneColumn)).toEqual([]);
  });
});
