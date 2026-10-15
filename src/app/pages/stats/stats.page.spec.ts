import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GENRES } from '../../core/data/genres.data';
import { GameService } from '../../core/services/game.service';
import { StatsService } from '../../core/services/stats.service';
import { StatsPage } from './stats.page';

const POP = GENRES.find((genre) => genre.id === 'pop')!;
const STORAGE_KEY = 'bandpick.stats.v1';

/** Plays a whole game through the real GameService, the way the app does. */
function playGame(rounds = 3): string {
  const game = TestBed.inject(GameService);
  game.start(POP, rounds);
  while (game.status() === 'playing') {
    game.choose('left');
  }
  return game.result()!.champion.id;
}

describe('StatsPage', () => {
  let fixture: ComponentFixture<StatsPage>;

  function text(): string {
    return fixture.nativeElement.textContent ?? '';
  }

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  describe('with nothing played', () => {
    beforeEach(async () => {
      localStorage.removeItem(STORAGE_KEY);
      await TestBed.configureTestingModule({
        imports: [StatsPage],
        providers: [provideRouter([])],
      }).compileComponents();

      fixture = TestBed.createComponent(StatsPage);
      fixture.detectChanges();
    });

    it('invites the player to play instead of showing zeros', () => {
      expect(text()).toContain('No games played yet');
      expect(text()).not.toContain('Most crowned');
      expect(fixture.nativeElement.querySelector('.podium')).toBeNull();
    });

    it('starts a fresh setup when Play now is tapped', () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigateByUrl')
        .mockResolvedValue(true);
      const game = TestBed.inject(GameService);
      game.start(POP, 3);

      const button = (
        Array.from(fixture.nativeElement.querySelectorAll('ion-button')) as HTMLElement[]
      ).find((candidate) => candidate.textContent?.trim() === 'Play now')!;
      button.click();

      expect(game.status()).toBe('idle');
      expect(navigate).toHaveBeenCalledWith('/setup');
    });
  });

  describe('with games on record', () => {
    let champions: string[];

    beforeEach(async () => {
      localStorage.removeItem(STORAGE_KEY);
      await TestBed.configureTestingModule({
        imports: [StatsPage],
        providers: [provideRouter([])],
      }).compileComponents();

      // Three games: two crowned the same band, one a different band.
      const game = TestBed.inject(GameService);
      champions = [];
      game.start(POP, 4);
      while (game.status() === 'playing') {
        game.choose('left');
      }
      champions.push(game.result()!.champion.id);

      game.start(POP, 2);
      while (game.status() === 'playing') {
        game.choose('left');
      }
      champions.push(game.result()!.champion.id);

      game.startBracket(POP, 8);
      while (game.status() === 'playing') {
        game.choose('left');
      }
      champions.push(game.result()!.champion.id);

      fixture = TestBed.createComponent(StatsPage);
      fixture.detectChanges();
    });

    it('shows the headline counts and the format split', () => {
      const summary = TestBed.inject(StatsService).summary();

      expect(text()).toContain('3');
      expect(text()).toContain('Games played');
      expect(text()).toContain(`${summary.standardGames} standard`);
      expect(text()).toContain(`${summary.bracketGames} bracket`);
    });

    it('puts the most-crowned band on the podium with its photo slot', () => {
      const summary = TestBed.inject(StatsService).summary();
      const top = summary.podium[0];
      const slots = Array.from(
        fixture.nativeElement.querySelectorAll('.podium__slot'),
      ) as HTMLElement[];

      expect(summary.gamesPlayed).toBe(3);
      // Whatever the shuffle crowned twice — or once, if all three differed —
      // the podium's first slot must show that band and its win count.
      expect(slots[0].querySelector('.podium__name')?.textContent?.trim()).toBe(top.artist.name);
      expect(slots[0].querySelector('.podium__wins')?.textContent).toContain(String(top.wins));
      expect(slots[0].classList.contains('podium__slot--first')).toBe(true);
      // Every slot has an avatar so the band's photo shows when one exists.
      expect(fixture.nativeElement.querySelectorAll('.podium__avatar')).toHaveLength(slots.length);
    });

    it('records the record tiles the summary supports', () => {
      const summary = TestBed.inject(StatsService).summary();

      expect(text()).toContain('Duels played');
      expect(text()).toContain('Bands crowned');
      expect(text()).toContain('Favourite lane');
      expect(text()).toContain(summary.duelsPlayed);
      // A bracket was played, so the biggest-bracket tile is present.
      expect(text()).toContain('Biggest bracket');
      expect(fixture.nativeElement.querySelector('.record')).not.toBeNull();
    });

    it('offers the same share destinations as the results screen', () => {
      const labels = (
        Array.from(fixture.nativeElement.querySelectorAll('.share__dest')) as HTMLElement[]
      ).map((element) => element.textContent?.trim());

      expect(labels).toEqual(['Instagram', 'Facebook', 'X', 'WhatsApp', 'Telegram']);
      expect(text()).toContain('Share your stats');
    });

    it('falls back cleanly when the share card image cannot be rendered', () => {
      // jsdom has no 2D canvas, so the preview is absent but the actions stay.
      expect(fixture.nativeElement.querySelector('.share__preview')).toBeNull();
      expect(fixture.nativeElement.querySelector('ion-toast')).not.toBeNull();
    });

    it('never shows the empty state once a game is on record', () => {
      expect(text()).not.toContain('No games played yet');
    });
  });
});
