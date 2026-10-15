import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GENRES } from '../../core/data/genres.data';
import { GameService } from '../../core/services/game.service';
import { BattlePage } from './battle.page';

const POP = GENRES.find((genre) => genre.id === 'pop')!;

describe('BattlePage', () => {
  let fixture: ComponentFixture<BattlePage>;
  let game: GameService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattlePage],
      providers: [provideRouter([])],
    }).compileComponents();

    game = TestBed.inject(GameService);
  });

  function createWith(rounds: number): void {
    game.start(POP, rounds);
    fixture = TestBed.createComponent(BattlePage);
    fixture.detectChanges();
  }

  function tiles(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.tile')) as HTMLElement[];
  }

  it('puts two artists on stage', () => {
    createWith(5);

    const pairing = game.pairing()!;
    const rendered = tiles();

    expect(rendered).toHaveLength(2);
    expect(rendered[0].textContent).toContain(pairing.left.name);
    expect(rendered[1].textContent).toContain(pairing.right.name);
    // Each tile carries the avatar, which is what puts the photo on the board.
    expect(rendered[0].querySelector('app-artist-avatar')).not.toBeNull();
    expect(rendered[1].querySelector('app-artist-avatar')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Round 1 / 5');
    expect(fixture.nativeElement.textContent).toContain('Which one do you prefer?');
  });

  it('advances a round and keeps the chosen artist on its tile', () => {
    createWith(5);

    const before = game.pairing()!;
    tiles()[1].click();
    fixture.detectChanges();

    expect(game.round()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Round 2 / 5');

    const after = game.pairing()!;
    expect(after.right.id).toBe(before.right.id);
    expect(after.left.id).not.toBe(before.left.id);

    // The survivor is still the second tile on screen.
    expect(tiles()[1].textContent).toContain(before.right.name);
  });

  it('leaves both tiles unlabelled, relying on position to show the survivor', () => {
    createWith(4);
    tiles()[0].click();
    fixture.detectChanges();

    const hints = Array.from(
      fixture.nativeElement.querySelectorAll('.tile__hint'),
    ) as HTMLElement[];

    expect(fixture.nativeElement.textContent).not.toContain('Defending champion');
    expect(hints).toHaveLength(2);
    expect(hints.every((hint) => hint.textContent?.trim() === 'Tap to pick')).toBe(true);
  });

  it('shows "Final round" on the last decision', () => {
    createWith(2);

    game.choose('left');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Round 2 / 2');
    expect(fixture.nativeElement.textContent).toContain('Final round');
  });

  it('ignores a double tap so a round cannot be skipped', () => {
    createWith(6);

    const tile = tiles()[0];
    tile.click();
    tile.click();
    fixture.detectChanges();

    // The tap lock swallows the immediate second tap.
    expect(game.round()).toBe(2);
  });

  it('hands over to the results screen after the last round', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    game.start(POP, 1);
    fixture = TestBed.createComponent(BattlePage);
    fixture.detectChanges();

    const chosen = game.pairing()!.left;
    tiles()[0].click();
    fixture.detectChanges();

    expect(game.status()).toBe('finished');
    expect(game.result()!.champion.id).toBe(chosen.id);
    expect(navigate).toHaveBeenCalledWith('/results', { replaceUrl: true });
  });

  it('labels knockout play with the stage and the tie count', () => {
    game.startBracket(POP, 16);
    fixture = TestBed.createComponent(BattlePage);
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Round of 16 · Tie 1 of 8');
    expect(text).toContain('7 more ties this round');
    expect(text).toContain('lose once and you are out');

    // Standard-mode wording must not leak into a bracket.
    expect(text).not.toContain('Round 1 / 4');
    expect(text).not.toContain('new challenger steps up');
  });

  it('moves the bracket header on to the next stage', () => {
    game.startBracket(POP, 16);
    fixture = TestBed.createComponent(BattlePage);
    fixture.detectChanges();

    // A tile tap advances the bracket (the tap lock ignores an immediate
    // second tap), then the service drives the rest of the stage.
    tiles()[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Round of 16 · Tie 2 of 8');

    for (let tie = 1; tie < 8; tie++) {
      game.choose('left');
      fixture.detectChanges();
    }

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Quarter-final · Tie 1 of 4');
    expect(text).toContain('3 more ties this round');
  });

  it('announces the last duel of a bracket as the one that decides the crown', () => {
    game.startBracket(POP, 8);
    fixture = TestBed.createComponent(BattlePage);
    fixture.detectChanges();

    // Seven duels decide an 8-artist bracket; the last one is the final.
    for (let tie = 0; tie < 6; tie++) {
      game.choose('left');
      fixture.detectChanges();
    }

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Final · Tie 1 of 1');
    expect(text).toContain('The crown is on the line');
  });
});
