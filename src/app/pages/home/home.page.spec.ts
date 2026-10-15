import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { GENRES } from '../../core/data/genres.data';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let game: GameService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();

    game = TestBed.inject(GameService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  });

  function buttonWith(label: string): HTMLElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('ion-button'),
    ) as HTMLElement[];
    const match = buttons.find((button) => button.textContent?.trim() === label);
    if (!match) {
      throw new Error(
        `No button labelled "${label}". Found: ${buttons
          .map((button) => button.textContent?.trim())
          .join(', ')}`,
      );
    }
    return match;
  }

  it('greets the player with the game name, and nothing more', () => {
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Band');
    expect(text).toContain('Pick');
    // "Band Edition" was a sub-brand that no longer meant anything.
    expect(text).not.toContain('Band Edition');
  });

  it('offers Play, Stats and Instructions, in that order', () => {
    const labels = (
      Array.from(fixture.nativeElement.querySelectorAll('ion-button')) as HTMLElement[]
    ).map((button) => button.textContent?.trim());

    expect(labels).toEqual(['Play', 'Stats', 'Instructions']);
  });

  it('starts a fresh setup when Play is tapped', () => {
    // Leave a game behind first, to prove Play clears it.
    game.start(GENRES[0], 5);
    game.choose('left');

    buttonWith('Play').click();
    fixture.detectChanges();

    expect(game.status()).toBe('idle');
    expect(navigate).toHaveBeenCalledWith('/setup');
  });

  it('opens the instructions when Instructions is tapped', () => {
    buttonWith('Instructions').click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/instructions');
  });

  it('opens the stats when Stats is tapped', () => {
    buttonWith('Stats').click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/stats');
  });
});
