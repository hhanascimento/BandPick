import { GENRES } from '../data/genres.data';
import type { GameResult } from './game.model';
import { playedGameFrom, summarise, type PlayedGame } from './stats.model';

const POP = GENRES.find((genre) => genre.id === 'pop')!;
const ROCK = GENRES.find((genre) => genre.id === 'rock')!;

/** The minimum GameResult the log snapshot needs; the rest is never read. */
function resultFor(
  genre: typeof POP,
  championIndex: number,
  overrides: Partial<GameResult> = {},
): GameResult {
  return {
    genre,
    format: 'gauntlet',
    totalRounds: 5,
    champion: genre.artists[championIndex],
    eliminations: [],
    matchups: [],
    ...overrides,
  } as GameResult;
}

/** Builds a log entry directly, for tests that only care about the summary. */
function game(overrides: Partial<PlayedGame> = {}): PlayedGame {
  return {
    format: 'gauntlet',
    genreId: POP.id,
    genreName: POP.name,
    championId: POP.artists[0].id,
    championName: POP.artists[0].name,
    rounds: 5,
    finishedAt: 1_000,
    ...overrides,
  };
}

describe('playedGameFrom', () => {
  it('snapshots the champion, genre, format and round count', () => {
    const played = playedGameFrom(resultFor(ROCK, 2));

    expect(played.format).toBe('gauntlet');
    expect(played.genreId).toBe(ROCK.id);
    expect(played.genreName).toBe(ROCK.name);
    expect(played.championId).toBe(ROCK.artists[2].id);
    expect(played.championName).toBe(ROCK.artists[2].name);
    expect(played.rounds).toBe(5);
    expect(played.bracketSize).toBeUndefined();
    expect(played.finishedAt).toBeGreaterThan(0);
  });

  it('keeps the bracket size for knockout games', () => {
    const played = playedGameFrom(
      resultFor(POP, 0, {
        format: 'bracket',
        totalRounds: 4,
        bracket: {
          size: 16,
          stages: [
            { number: 1, name: 'Round of 16', ties: 8 },
            { number: 2, name: 'Quarter-final', ties: 4 },
            { number: 3, name: 'Semi-final', ties: 2 },
            { number: 4, name: 'Final', ties: 1 },
          ],
        },
      }),
    );

    expect(played.format).toBe('bracket');
    expect(played.bracketSize).toBe(16);
    expect(played.rounds).toBe(4);
  });
});

describe('summarise', () => {
  it('reports nothing played for an empty log', () => {
    const summary = summarise([]);

    expect(summary.gamesPlayed).toBe(0);
    expect(summary.podium).toEqual([]);
    expect(summary.favouriteGenre).toBeNull();
    expect(summary.longestStreak).toBe(0);
    expect(summary.biggestBracket).toBe(0);
    expect(summary.firstPlayedAt).toBeNull();
  });

  it('splits games by format and counts the duels each format implies', () => {
    const summary = summarise([
      game({ rounds: 7 }),
      game({ rounds: 3 }),
      game({
        format: 'bracket',
        rounds: 4,
        bracketSize: 16,
        championId: 'other',
        championName: 'Other',
      }),
    ]);

    expect(summary.gamesPlayed).toBe(3);
    expect(summary.standardGames).toBe(2);
    expect(summary.bracketGames).toBe(1);
    // 7 + 3 rounds, plus the 15 duels of a 16-artist bracket.
    expect(summary.duelsPlayed).toBe(25);
  });

  it('crowns the podium by wins, most recent first on a tie', () => {
    const summary = summarise([
      game({ championId: 'a', championName: 'Alpha', finishedAt: 100 }),
      game({ championId: 'b', championName: 'Bravo', finishedAt: 200 }),
      game({ championId: 'a', championName: 'Alpha', finishedAt: 300 }),
      // Bravo and Charlie both have one crown; Bravo's is more recent.
      game({ championId: 'c', championName: 'Charlie', finishedAt: 50 }),
    ]);

    expect(summary.podium.map((entry) => entry.artist.id)).toEqual(['a', 'b', 'c']);
    expect(summary.podium[0].wins).toBe(2);
    expect(summary.podium[1].lastWonAt).toBe(200);
    expect(summary.podium[2].lastWonAt).toBe(50);
  });

  it('breaks a win-and-date tie alphabetically, and shows at most three bands', () => {
    const summary = summarise([
      game({ championId: 'z', championName: 'Zed', finishedAt: 10 }),
      game({ championId: 'a', championName: 'Ada', finishedAt: 10 }),
      game({ championId: 'm', championName: 'Meg', finishedAt: 10 }),
      game({ championId: 'q', championName: 'Quinn', finishedAt: 10 }),
    ]);

    expect(summary.podium).toHaveLength(3);
    // Ada, Meg, Quinn — sorted alphabetically; Zed is the one left off.
    expect(summary.podium.map((entry) => entry.artist.name)).toEqual(['Ada', 'Meg', 'Quinn']);
    // Everyone still counted as crowned, even off the podium.
    expect(summary.crowned).toBe(4);
  });

  it('names the most-played genre, and the earliest game on record', () => {
    const summary = summarise([
      game({ genreId: 'rock', genreName: 'Rock', finishedAt: 500 }),
      game({ genreId: 'pop', genreName: 'Pop', finishedAt: 900 }),
      game({ genreId: 'rock', genreName: 'Rock', finishedAt: 700 }),
    ]);

    expect(summary.favouriteGenre).toEqual({ genreId: 'rock', genreName: 'Rock', games: 2 });
    expect(summary.firstPlayedAt).toBe(500);
  });

  it('measures the longest streak and the biggest bracket separately', () => {
    const summary = summarise([
      game({ rounds: 4 }),
      game({ rounds: 12 }),
      game({ format: 'bracket', rounds: 3, bracketSize: 8, championId: 'x', championName: 'X' }),
      game({ format: 'bracket', rounds: 4, bracketSize: 16, championId: 'y', championName: 'Y' }),
    ]);

    expect(summary.longestStreak).toBe(12);
    expect(summary.biggestBracket).toBe(16);
  });
});
