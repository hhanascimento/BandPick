import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { GENRES } from './core/data/genres.data';
import { GameService } from './core/services/game.service';

/**
 * Exercises the real router configuration and guards.
 *
 * These are the paths a player can actually hit: the Android back button, a
 * reload mid-game, and a deep link all land here, so a wrong guard would either
 * strand the player on a blank board or lock them out of a finished game.
 */
describe('routes + guards', () => {
  let router: Router;
  let game: GameService;

  // Every page is lazily imported, and Vitest transforms those chunks on first
  // use. That one-off cost is longer than the default per-test timeout, so pay
  // it here once instead of letting it land on whichever test navigates first.
  beforeAll(async () => {
    await Promise.all([
      import('./pages/home/home.page'),
      import('./pages/instructions/instructions.page'),
      import('./pages/stats/stats.page'),
      import('./pages/setup/setup.page'),
      import('./pages/battle/battle.page'),
      import('./pages/results/results.page'),
    ]);
  }, 60_000);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();

    router = TestBed.inject(Router);
    game = TestBed.inject(GameService);
  });

  /** Navigates and reports the URL the router actually settled on. */
  async function goTo(path: string): Promise<string> {
    await router.navigateByUrl(path);
    return router.url;
  }

  it('sends the root path to the home screen', async () => {
    expect(await goTo('/')).toBe('/home');
  });

  it('sends an unknown path to the home screen', async () => {
    expect(await goTo('/does-not-exist')).toBe('/home');
  });

  it('lets the player reach setup, instructions, stats and the photo credits at any time', async () => {
    expect(await goTo('/setup')).toBe('/setup');
    expect(await goTo('/instructions')).toBe('/instructions');
    expect(await goTo('/stats')).toBe('/stats');
    expect(await goTo('/credits')).toBe('/credits');
  });

  it('refuses /battle when no game is in progress', async () => {
    // e.g. the player reloaded the page while playing.
    expect(await goTo('/battle')).toBe('/home');
  });

  it('refuses /results before any game has been played', async () => {
    expect(await goTo('/results')).toBe('/home');
  });

  it('allows /battle while a game is in progress', async () => {
    game.start(GENRES[0], 3);

    expect(await goTo('/battle')).toBe('/battle');
    expect(game.status()).toBe('playing');
  });

  it('refuses /results while a game is still in progress', async () => {
    game.start(GENRES[0], 3);
    await goTo('/battle');

    expect(await goTo('/results')).toBe('/home');
    expect(game.status()).toBe('playing');
  });

  it('allows /results once a champion exists', async () => {
    game.start(GENRES[0], 1);
    await goTo('/battle');
    game.choose('left');

    expect(game.status()).toBe('finished');
    expect(await goTo('/results')).toBe('/results');
  });

  it('closes /battle again after the game is finished', async () => {
    game.start(GENRES[0], 1);
    await goTo('/battle');
    game.choose('left');
    await goTo('/results');

    // Back button out of a finished duel must not reopen the board.
    expect(await goTo('/battle')).toBe('/home');
  });

  it('reopens /battle for the next game after a reset', async () => {
    game.start(GENRES[0], 1);
    await goTo('/battle');
    game.choose('left');
    await goTo('/results');

    game.reset();
    await goTo('/home');
    game.start(GENRES[0], 2);

    expect(await goTo('/battle')).toBe('/battle');
  });

  it('reopens /battle when replaying from the results screen', async () => {
    game.start(GENRES[0], 2);
    await goTo('/battle');
    game.choose('left');
    game.choose('left');
    await goTo('/results');

    game.restart();

    expect(await goTo('/battle')).toBe('/battle');
    expect(game.status()).toBe('playing');
    expect(game.round()).toBe(1);
  });
});
