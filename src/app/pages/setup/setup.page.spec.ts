import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GENRES } from '../../core/data/genres.data';
import { GameService } from '../../core/services/game.service';
import { SetupPage } from './setup.page';

describe('SetupPage', () => {
  let fixture: ComponentFixture<SetupPage>;
  let game: GameService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupPage],
      providers: [provideRouter([])],
    }).compileComponents();

    game = TestBed.inject(GameService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(SetupPage);
    fixture.detectChanges();
  });

  function genreButton(name: string): HTMLElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.genre-card'),
    ) as HTMLElement[];
    const match = buttons.find((button) => button.querySelector('.genre-card__name')?.textContent?.trim() === name);
    if (!match) {
      throw new Error(`No genre card for "${name}".`);
    }
    return match;
  }

  function startButton(): HTMLElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('ion-button'),
    ) as HTMLElement[];
    const match = buttons.find((button) => button.textContent?.includes('Start'));
    if (!match) {
      throw new Error('No Start button rendered.');
    }
    return match;
  }

  it('asks for rounds and offers every genre', () => {
    const cards = fixture.nativeElement.querySelectorAll('.genre-card');
    expect(cards.length).toBe(GENRES.length);

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('How many rounds?');
    expect(text).toContain('Pick a music style');
  });

  it('will not start a game until a genre is chosen', () => {
    expect(fixture.nativeElement.textContent).toContain('Choose a music style to continue');

    startButton().click();
    fixture.detectChanges();

    expect(game.status()).toBe('idle');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a summary and starts the game once a genre is picked', () => {
    genreButton('Rock').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Rock · 10 rounds');

    startButton().click();
    fixture.detectChanges();

    expect(game.status()).toBe('playing');
    expect(game.genre()?.name).toBe('Rock');
    expect(game.totalRounds()).toBe(10);
    expect(navigate).toHaveBeenCalledWith('/battle');
  });

  it('honours a quick pick for the round count', () => {
    const quickPicks = Array.from(
      fixture.nativeElement.querySelectorAll('.quick-pick'),
    ) as HTMLElement[];
    const longest = quickPicks.find(
      (button) => button.textContent?.trim() === String(GameService.MAX_ROUNDS),
    );
    expect(longest).toBeDefined();

    longest!.click();
    genreButton('Jazz').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(`Jazz · ${GameService.MAX_ROUNDS} rounds`);

    startButton().click();
    expect(game.totalRounds()).toBe(GameService.MAX_ROUNDS);
  });

  it('drives the round slider from the shared cap', () => {
    // The slider ceiling and the service clamp must not drift apart: Ionic sets
    // max as a property on the custom element, so check both forms.
    expect(GameService.MAX_ROUNDS).toBe(20);

    const range = fixture.nativeElement.querySelector('ion-range') as HTMLElement & {
      max?: number;
    };
    const max = range.max ?? Number(range.getAttribute('max'));

    expect(max).toBe(GameService.MAX_ROUNDS);
  });

  it('offers both formats and opens on the standard one', () => {
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.format-card__title'),
    ).map((node) => (node as HTMLElement).textContent?.trim());

    expect(titles).toEqual(['Standard', 'Bracket']);
    expect(fixture.nativeElement.textContent).toContain('How many rounds?');
    expect(fixture.nativeElement.textContent).not.toContain('How big is the bracket?');
  });

  it('swaps the rounds slider for a bracket size picker', () => {
    formatButton('Bracket').click();
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('How big is the bracket?');
    expect(text).not.toContain('How many rounds?');
    expect(fixture.nativeElement.querySelector('ion-range')).toBeNull();

    const sizes = Array.from(fixture.nativeElement.querySelectorAll('.quick-pick')).map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );
    expect(sizes).toEqual(GameService.BRACKET_SIZES.map((size) => `Last ${size}`));
  });

  it('starts a knockout once a genre is picked', () => {
    formatButton('Bracket').click();
    genreButton('Metal').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      `Metal · ${GameService.MAX_BRACKET_SIZE}-band bracket`,
    );

    startButton().click();

    expect(game.format()).toBe('bracket');
    expect(game.bracket()!.size).toBe(GameService.MAX_BRACKET_SIZE);
    expect(game.stageName()).toBe('Round of 16');
    expect(navigate).toHaveBeenCalledWith('/battle');
  });

  it('honours a smaller bracket and keeps the duels honest', () => {
    formatButton('Bracket').click();
    fixture.detectChanges();

    const eight = Array.from(fixture.nativeElement.querySelectorAll('.quick-pick')).find(
      (node) => (node as HTMLElement).textContent?.trim() === 'Last 8',
    ) as HTMLElement;
    expect(eight).toBeDefined();
    eight.click();

    genreButton('Jazz').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Jazz · 8-band bracket');
    expect(fixture.nativeElement.textContent).toContain('7 duels to the crown');

    startButton().click();
    expect(game.bracket()!.size).toBe(8);
    expect(game.stageName()).toBe('Quarter-final');
  });

  it('keeps the bracket ceiling at the last 16', () => {
    expect(GameService.MAX_BRACKET_SIZE).toBe(16);
    expect(GameService.BRACKET_SIZES).toContain(GameService.MAX_BRACKET_SIZE);
    expect(Math.max(...GameService.BRACKET_SIZES)).toBe(16);
  });

  function formatButton(name: string): HTMLElement {
    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.format-card'),
    ) as HTMLElement[];
    const match = cards.find((card) =>
      card.querySelector('.format-card__title')?.textContent?.includes(name),
    );
    if (!match) {
      throw new Error(`No format card for "${name}".`);
    }
    return match;
  }
});
