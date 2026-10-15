import { TestBed } from '@angular/core/testing';
import { GENRES } from '../data/genres.data';
import { GameService } from './game.service';
import { StatsService } from './stats.service';

const STORAGE_KEY = 'bandpick.stats.v1';
const POP = GENRES.find((genre) => genre.id === 'pop')!;

/** Plays a whole game through the real GameService, the way the app does. */
function playGame(game: GameService, rounds = 3): void {
  game.start(POP, rounds);
  while (game.status() === 'playing') {
    game.choose('left');
  }
}

describe('StatsService', () => {
  let stats: StatsService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({});
    stats = TestBed.inject(StatsService);
  });

  it('starts with nothing played', () => {
    expect(stats.games()).toEqual([]);
    expect(stats.summary().gamesPlayed).toBe(0);
  });

  it('counts a game the moment it is finished, through the real GameService', () => {
    const game = TestBed.inject(GameService);
    playGame(game, 4);

    expect(stats.summary().gamesPlayed).toBe(1);
    expect(stats.summary().standardGames).toBe(1);
    expect(stats.summary().duelsPlayed).toBe(4);
    expect(stats.summary().podium[0].artist.id).toBe(game.result()!.champion.id);
  });

  it('keeps playing after a game does not go through the injector', () => {
    // `new GameService()` has no stats service to record to — the unit-test
    // path — and must not throw when a champion is crowned.
    const bare = new GameService();
    bare.start(POP, 2);
    bare.choose('left');
    bare.choose('left');

    expect(bare.status()).toBe('finished');
    expect(stats.summary().gamesPlayed).toBe(0);
  });

  it('persists the log, so a fresh service sees the same games', () => {
    playGame(TestBed.inject(GameService), 3);

    const reloaded = new StatsService();
    expect(reloaded.summary().gamesPlayed).toBe(1);
    expect(reloaded.summary().podium[0].wins).toBe(1);
  });

  it('survives corrupt storage by starting empty', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const fromCorrupt = new StatsService();
    expect(fromCorrupt.games()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    const fromShape = new StatsService();
    expect(fromShape.games()).toEqual([]);
  });

  it('drops log entries that do not look like a played game', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { garbage: true },
        null,
        {
          format: 'gauntlet',
          genreId: 'pop',
          championId: 'a',
          championName: 'A',
          rounds: 3,
          finishedAt: 10,
        },
      ]),
    );

    const filtered = new StatsService();
    expect(filtered.games()).toHaveLength(1);
    expect(filtered.summary().gamesPlayed).toBe(1);
  });
});
