import { GENRES } from '../data/genres.data';
import type { Genre } from '../models/genre.model';
import type { Side } from '../models/game.model';
import { GameService, InvalidGameSetupError } from './game.service';

/** Plays a game through to the end, choosing the given tile each round. */
function playToEnd(game: GameService, pick: (round: number) => Side = () => 'left'): void {
  let safety = 0;
  while (game.status() === 'playing') {
    if (safety++ > 200) {
      throw new Error('Game did not finish within 200 rounds.');
    }
    game.choose(pick(game.round()));
  }
}

/** Looks a genre up by id so the tests never depend on catalogue ordering. */
function genreById(id: string): Genre {
  const found = GENRES.find((genre) => genre.id === id);
  if (!found) {
    throw new Error(`Genre "${id}" is missing from the catalogue.`);
  }
  return found;
}

const POP = genreById('pop');
const ROCK = genreById('rock');
const HIPHOP = genreById('hip-hop');
const ELECTRONIC = genreById('electronic');
const METAL = genreById('metal');
const COUNTRY = genreById('country');
const JAZZ = genreById('jazz');

describe('GameService', () => {
  it('starts idle', () => {
    const game = new GameService();
    expect(game.status()).toBe('idle');
    expect(game.pairing()).toBeNull();
    expect(game.result()).toBeNull();
  });

  it('opens with two different artists from the chosen genre', () => {
    const game = new GameService();
    game.start(POP, 5);

    expect(game.status()).toBe('playing');
    expect(game.round()).toBe(1);
    expect(game.totalRounds()).toBe(5);

    const pairing = game.pairing();
    expect(pairing).not.toBeNull();
    expect(pairing!.left.id).not.toBe(pairing!.right.id);

    const ids = new Set(POP.artists.map((artist) => artist.id));
    expect(ids.has(pairing!.left.id)).toBe(true);
    expect(ids.has(pairing!.right.id)).toBe(true);
  });

  it('clamps the requested rounds into the supported range', () => {
    const game = new GameService();

    game.start(POP, 99);
    expect(game.totalRounds()).toBe(GameService.MAX_ROUNDS);

    game.start(POP, 0);
    expect(game.totalRounds()).toBe(GameService.MIN_ROUNDS);

    game.start(POP, -4);
    expect(game.totalRounds()).toBe(GameService.MIN_ROUNDS);
  });

  it('refuses a round count the genre cannot fill', () => {
    const game = new GameService();
    const tiny: Genre = { ...POP, artists: POP.artists.slice(0, 3) };

    expect(() => game.start(tiny, 10)).toThrowError(InvalidGameSetupError);
    expect(game.status()).toBe('idle');
  });

  it('keeps the winning artist on its tile and swaps in a new challenger', () => {
    const game = new GameService();
    game.start(ROCK, 6);

    for (let round = 1; round <= 5; round++) {
      const before = game.pairing()!;
      game.choose('right');
      const after = game.pairing()!;

      expect(after.right.id).toBe(before.right.id);
      expect(after.left.id).not.toBe(before.left.id);
      expect(game.round()).toBe(round + 1);
    }
  });

  it('mirrors the tile swap when the left artist wins', () => {
    const game = new GameService();
    game.start(ROCK, 4);

    const before = game.pairing()!;
    game.choose('left');
    const after = game.pairing()!;

    expect(after.left.id).toBe(before.left.id);
    expect(after.right.id).not.toBe(before.right.id);
  });

  it('never repeats an artist and introduces exactly one newcomer per round', () => {
    const rounds = 12;
    const game = new GameService();
    game.start(HIPHOP, rounds);
    playToEnd(game);

    expect(game.matchups()).toHaveLength(rounds);

    const seen = new Set<string>();
    game.matchups().forEach((matchup, index) => {
      const newcomers = [matchup.left, matchup.right].filter(
        (artist) => !seen.has(artist.id),
      );
      // Round 1 seats two artists; every later round adds exactly one.
      expect(newcomers).toHaveLength(index === 0 ? 2 : 1);
      newcomers.forEach((artist) => seen.add(artist.id));
    });

    // N rounds use N + 1 artists in total.
    expect(seen.size).toBe(rounds + 1);
  });

  it('finishes after exactly the requested number of picks', () => {
    const game = new GameService();
    game.start(ELECTRONIC, 3);

    expect(game.status()).toBe('playing');
    game.choose('left');
    expect(game.status()).toBe('playing');
    game.choose('left');
    expect(game.status()).toBe('playing');
    game.choose('left');

    expect(game.status()).toBe('finished');
    expect(game.result()).not.toBeNull();
  });

  it('crowns the survivor and lists everyone it beat, in order', () => {
    const rounds = 9;
    const game = new GameService();
    game.start(METAL, rounds);
    playToEnd(game);

    const result = game.result()!;

    expect(result.totalRounds).toBe(rounds);
    expect(result.genre.id).toBe(METAL.id);
    expect(result.eliminations).toHaveLength(rounds);
    expect(result.matchups).toHaveLength(rounds);

    // One elimination per round, numbered 1..N.
    expect(result.eliminations.map((elimination) => elimination.round)).toEqual(
      Array.from({ length: rounds }, (_, index) => index + 1),
    );

    // The champion is never among the defeated and never lost a duel.
    const defeatedIds = result.eliminations.map((elimination) => elimination.artist.id);
    expect(defeatedIds).not.toContain(result.champion.id);
    expect(defeatedIds).toHaveLength(new Set(defeatedIds).size);
    expect(result.matchups.filter((m) => m.loser.id === result.champion.id)).toHaveLength(0);

    // The champion won the very last duel.
    expect(result.matchups.at(-1)!.winner.id).toBe(result.champion.id);
  });

  it('crowns the artist the player kept picking', () => {
    const game = new GameService();
    game.start(COUNTRY, 8);
    playToEnd(game);
    const result = game.result()!;

    const firstPick = result.matchups[0].winner;
    // Every round the champion appeared in, it was the one chosen.
    for (const matchup of result.matchups) {
      if (matchup.left.id === firstPick.id || matchup.right.id === firstPick.id) {
        expect(matchup.winner.id).toBe(firstPick.id);
      }
    }
    expect(result.champion.id).toBe(firstPick.id);
  });

  it('completes a full-length game at the round cap', () => {
    const game = new GameService();
    game.start(POP, GameService.MAX_ROUNDS);
    playToEnd(game, (round) => (round % 2 === 0 ? 'left' : 'right'));

    expect(game.status()).toBe('finished');
    expect(game.result()!.eliminations).toHaveLength(GameService.MAX_ROUNDS);
    expect(game.progress()).toBe(1);
  });

  it('ignores picks once the game is over', () => {
    const game = new GameService();
    game.start(POP, 2);
    playToEnd(game);

    const finished = game.result();
    game.choose('left');
    expect(game.result()).toBe(finished);
    expect(game.matchups()).toHaveLength(2);
  });

  it('restarts with the same settings', () => {
    const game = new GameService();
    game.start(JAZZ, 7);
    playToEnd(game);
    expect(game.status()).toBe('finished');

    game.restart();
    expect(game.status()).toBe('playing');
    expect(game.totalRounds()).toBe(7);
    expect(game.round()).toBe(1);
    expect(game.eliminations()).toHaveLength(0);
    expect(game.result()).toBeNull();
  });

  it('clears everything on reset', () => {
    const game = new GameService();
    game.start(POP, 4);
    game.choose('left');
    game.reset();

    expect(game.status()).toBe('idle');
    expect(game.genre()).toBeNull();
    expect(game.totalRounds()).toBe(0);
    expect(game.pairing()).toBeNull();
    expect(game.eliminations()).toHaveLength(0);
  });

  it('reports the highest playable round count per genre', () => {
    const game = new GameService();
    expect(game.maxRoundsFor(POP)).toBe(GameService.MAX_ROUNDS);
    expect(game.maxRoundsFor({ ...POP, artists: POP.artists.slice(0, 4) })).toBe(3);
    expect(game.maxRoundsFor(null)).toBe(0);
  });

  it('never seats an undefined artist across many random games', () => {
    // The pool is sliced to rounds + 1; if that arithmetic ever drifts, a tile
    // would be filled with nothing. Run every round count twice to be sure.
    for (let rounds = GameService.MIN_ROUNDS; rounds <= GameService.MAX_ROUNDS; rounds++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const game = new GameService();
        game.start(genreById('k-pop'), rounds);

        while (game.status() === 'playing') {
          const pairing = game.pairing()!;
          expect(pairing.left).toBeDefined();
          expect(pairing.right).toBeDefined();
          expect(pairing.left.id).toBeTruthy();
          expect(pairing.right.id).toBeTruthy();
          game.choose(Math.random() < 0.5 ? 'left' : 'right');
        }

        expect(game.result()!.eliminations).toHaveLength(rounds);
      }
    }
  });
});

describe('GameService bracket play', () => {
  /** Plays a bracket through to the end, alternating tiles for varied winners. */
  function playBracket(game: GameService): void {
    let safety = 0;
    while (game.status() === 'playing') {
      if (safety++ > 200) {
        throw new Error('Bracket did not finish within 200 duels.');
      }
      game.choose(safety % 2 === 0 ? 'left' : 'right');
    }
  }

  it('opens a 16-artist bracket on the round of 16', () => {
    const game = new GameService();
    game.startBracket(POP, 16);

    expect(game.format()).toBe('bracket');
    expect(game.status()).toBe('playing');
    expect(game.bracket()!.size).toBe(16);
    expect(game.bracket()!.stages.map((stage) => stage.name)).toEqual([
      'Round of 16',
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);
    expect(game.round()).toBe(1);
    expect(game.stageName()).toBe('Round of 16');
    expect(game.tiesInStage()).toBe(8);
    expect(game.tieNumber()).toBe(1);
    // The champion survives one duel per stage, but the tournament is 15 duels.
    expect(game.totalRounds()).toBe(4);
    expect(game.duelsTotal()).toBe(15);
    expect(game.pairing()!.left.id).not.toBe(game.pairing()!.right.id);
  });

  it('runs an 8-artist bracket straight from the quarter-finals', () => {
    const game = new GameService();
    game.startBracket(ROCK, 8);

    expect(game.bracket()!.stages.map((stage) => stage.name)).toEqual([
      'Quarter-final',
      'Semi-final',
      'Final',
    ]);
    expect(game.totalRounds()).toBe(3);
    expect(game.tiesInStage()).toBe(4);
  });

  it('rejects a size it does not offer, or one the genre cannot field', () => {
    const game = new GameService();

    expect(() => game.startBracket(POP, 12)).toThrow(InvalidGameSetupError);
    expect(() => game.startBracket(POP, 32)).toThrow(InvalidGameSetupError);
    expect(() => game.startBracket({ ...POP, artists: POP.artists.slice(0, 5) }, 8)).toThrow(
      InvalidGameSetupError,
    );
  });

  it('decides a 16-artist bracket in 15 duels with one champion', () => {
    const game = new GameService();
    game.startBracket(POP, 16);
    playBracket(game);

    const result = game.result()!;
    expect(game.status()).toBe('finished');
    expect(result.format).toBe('bracket');
    expect(result.totalRounds).toBe(4);
    expect(result.matchups).toHaveLength(15);
    expect(result.eliminations).toHaveLength(15);
    expect(result.bracket?.size).toBe(16);

    // Exactly one artist survives 16 entrants, and nobody is eliminated twice.
    const eliminated = result.eliminations.map((elimination) => elimination.artist.id);
    expect(new Set(eliminated).size).toBe(15);
    expect(eliminated).not.toContain(result.champion.id);

    const entrants = new Set(result.matchups.flatMap((m) => [m.left.id, m.right.id]));
    expect(entrants.size).toBe(16);
  });

  it('crowns the winner of the final, and only the final decides the champion', () => {
    const game = new GameService();
    game.startBracket(POP, 16);
    playBracket(game);

    const result = game.result()!;
    const lastDuel = result.matchups.at(-1)!;
    expect(lastDuel.round).toBe(4);
    expect(result.champion.id).toBe(lastDuel.winner.id);

    // The champion had to win one duel in every stage.
    for (const stage of result.bracket!.stages) {
      const duels = result.matchups.filter((m) => m.round === stage.number);
      expect(duels).toHaveLength(stage.ties);
      expect(duels.some((m) => m.winner.id === result.champion.id)).toBe(true);
    }
  });

  it('halves the field at every stage, so each winner carries its record forward', () => {
    const game = new GameService();
    game.startBracket(METAL, 16);

    // Walk the opening stage and check the tie counter and stage hand-over.
    for (let tie = 0; tie < 8; tie++) {
      expect(game.stageName()).toBe('Round of 16');
      expect(game.tieNumber()).toBe(tie + 1);
      game.choose('left');
    }

    expect(game.round()).toBe(2);
    expect(game.stageName()).toBe('Quarter-final');
    expect(game.tieNumber()).toBe(1);
    expect(game.tiesInStage()).toBe(4);
    expect(game.matchups()).toHaveLength(8);

    // Every artist still in the bracket won its opening duel.
    const advanced = new Set(game.matchups().map((matchup) => matchup.winner.id));
    const pairing = game.pairing()!;
    expect(advanced.has(pairing.left.id)).toBe(true);
    expect(advanced.has(pairing.right.id)).toBe(true);
  });

  it('records the stage an artist went out in, and maps stages onto rounds', () => {
    const game = new GameService();
    game.startBracket(COUNTRY, 8);

    game.choose('right');
    expect(game.eliminations()[0].stageName).toBe('Quarter-final');
    expect(game.eliminations()[0].round).toBe(1);

    playBracket(game);
    const stages = new Set(game.result()!.eliminations.map((e) => e.stageName));
    expect(stages).toEqual(new Set(['Quarter-final', 'Semi-final', 'Final']));
  });

  it('counts progress over every duel in the bracket, not just the winner\'s', () => {
    const game = new GameService();
    game.startBracket(JAZZ, 8);

    // An 8-artist knockout is 7 duels, even though the champion survives 3.
    expect(game.duelsTotal()).toBe(7);
    expect(game.totalRounds()).toBe(3);
    expect(game.progress()).toBe(0);

    game.choose('left');
    expect(game.progress()).toBeCloseTo(1 / 7);

    playBracket(game);
    expect(game.progress()).toBeCloseTo(1);
  });

  it('never repeats an artist and never seats an undefined one', () => {
    for (const size of GameService.BRACKET_SIZES) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const game = new GameService();
        game.startBracket(HIPHOP, size);

        while (game.status() === 'playing') {
          const pairing = game.pairing()!;
          expect(pairing.left?.id).toBeTruthy();
          expect(pairing.right?.id).toBeTruthy();
          expect(pairing.left.id).not.toBe(pairing.right.id);
          game.choose(Math.random() < 0.5 ? 'left' : 'right');
        }

        const result = game.result()!;
        expect(result.eliminations).toHaveLength(size - 1);
        const seen = result.eliminations.map((elimination) => elimination.artist.id);
        expect(new Set(seen).size).toBe(size - 1);
      }
    }
  });

  it('replays a bracket at the same size, and a gauntlet after a bracket', () => {
    const game = new GameService();
    game.startBracket(ELECTRONIC, 8);
    playBracket(game);

    game.restart();
    expect(game.format()).toBe('bracket');
    expect(game.bracket()!.size).toBe(8);
    expect(game.status()).toBe('playing');

    // Switching format must clear the bracket, or the battle screen would keep
    // showing knockout labels over a survivor streak.
    game.start(ELECTRONIC, 5);
    expect(game.format()).toBe('gauntlet');
    expect(game.bracket()).toBeNull();
    expect(game.stageName()).toBeNull();
    expect(game.totalRounds()).toBe(5);
  });

  it('reports the largest bracket a genre can field', () => {
    const game = new GameService();
    expect(game.maxBracketSizeFor(POP)).toBe(GameService.MAX_BRACKET_SIZE);
    expect(game.maxBracketSizeFor({ ...POP, artists: POP.artists.slice(0, 7) })).toBe(0);
    expect(game.maxBracketSizeFor({ ...POP, artists: POP.artists.slice(0, 8) })).toBe(8);
    expect(game.maxBracketSizeFor(null)).toBe(0);
  });
});
