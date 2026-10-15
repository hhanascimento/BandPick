import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { GENRES } from '../../core/data/genres.data';
import { GameService } from '../../core/services/game.service';
import { SpotifyService, type SpotifyTarget } from '../../core/services/spotify.service';
import { bracketBoard, bracketJoinsByGap } from '../../shared/bracket-board';
import { ResultsPage } from './results.page';

const METAL = GENRES.find((genre) => genre.id === 'metal')!;

describe('ResultsPage', () => {
  let fixture: ComponentFixture<ResultsPage>;
  let game: GameService;
  let rounds: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResultsPage],
      providers: [provideRouter([])],
    }).compileComponents();

    game = TestBed.inject(GameService);
    rounds = 6;
    game.start(METAL, rounds);
    while (game.status() === 'playing') {
      game.choose('left');
    }

    fixture = TestBed.createComponent(ResultsPage);
    fixture.detectChanges();
  });

  /** Results page uses the real Router, so spy before constructing the page if needed. */
  function defeatNames(): string[] {
    return (
      Array.from(fixture.nativeElement.querySelectorAll('.defeated__name')) as HTMLElement[]
    ).map((element) => element.textContent?.trim() ?? '');
  }

  function text(): string {
    return fixture.nativeElement.textContent ?? '';
  }

  it('highlights the champion', () => {
    const champion = game.result()!.champion;
    const name: string = fixture.nativeElement.querySelector('.champion__name').textContent;

    expect(name.trim()).toBe(champion.name);
    expect(text()).toContain('Champion');
    expect(text()).toContain(METAL.name);
  });

  it('lists every defeated artist next to the champion', () => {
    const result = game.result()!;

    expect(defeatNames()).toEqual(result.eliminations.map((e) => e.artist.name));
    expect(text()).toContain(`Out in round ${rounds}`);
  });

  it('never lists the champion as defeated', () => {
    const champion = game.result()!.champion;
    expect(defeatNames()).not.toContain(champion.name);
  });

  it('shows a share area with the requested destinations', () => {
    const labels = (
      Array.from(fixture.nativeElement.querySelectorAll('.share__dest')) as HTMLElement[]
    ).map((element) => element.textContent?.trim());

    expect(labels).toEqual(['Instagram', 'Facebook', 'X', 'WhatsApp', 'Telegram']);
    expect(text()).toContain('Share your champion');
    expect(text()).toContain('Copy');
  });

  it('falls back cleanly when the share card image cannot be rendered', () => {
    // jsdom has no 2D canvas, so this asserts the graceful degradation path:
    // the share actions must still be present without the preview image.
    expect(fixture.nativeElement.querySelector('.share__preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-toast')).not.toBeNull();
  });

  it('offers a way to play again and to change the setup', () => {
    const labels = (
      Array.from(fixture.nativeElement.querySelectorAll('ion-button')) as HTMLElement[]
    ).map((element) => element.textContent?.trim());

    expect(labels).toContain('Change genre, format or rounds');
    expect(labels.some((label) => label?.startsWith('Play again'))).toBe(true);
  });

  it('has no bracket to show after a survivor streak', () => {
    expect(fixture.nativeElement.querySelector('.bracket')).toBeNull();
    expect(text()).toContain('Defeated');
  });

  it('gives the champion the card to itself, with the results underneath', () => {
    const champion = fixture.nativeElement.querySelector('.champion') as HTMLElement;
    const defeated = fixture.nativeElement.querySelector('.defeated') as HTMLElement;

    expect(champion).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: the beaten artists come after the champion,
    // never beside it.
    expect(champion.compareDocumentPosition(defeated)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not claim the champion survived anything', () => {
    expect(text()).not.toContain('Survived');
    expect(fixture.nativeElement.querySelector('.champion__record')).toBeNull();
  });

  describe('the listen section', () => {
    it('sits directly before the share section', () => {
      const listen = fixture.nativeElement.querySelector('.listen') as HTMLElement | null;
      const share = fixture.nativeElement.querySelector('.share') as HTMLElement;

      expect(listen).not.toBeNull();
      // DOCUMENT_POSITION_FOLLOWING means the share panel comes after the player.
      expect(listen!.compareDocumentPosition(share)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('names the section and the artist it is offering', () => {
      expect(text()).toContain('Listen to the band');
      expect(text()).toContain(game.result()!.champion.name);
    });

    it('renders the player and the button the service asked for', () => {
      const champion = game.result()!.champion;
      const target = TestBed.inject(SpotifyService).target(champion);
      const frame = fixture.nativeElement.querySelector('.listen__embed') as HTMLElement | null;
      const button = fixture.nativeElement.querySelector('.cta--spotify') as HTMLElement;

      // Either a real Spotify player or the search fallback — matching what the
      // service resolved for this champion, so the two can never disagree.
      expect(Boolean(frame)).toBe(Boolean(target.embedUrl));
      if (frame) {
        // Built from the resolved id, so this checks the frame points at this
        // artist rather than at whatever the template happened to render.
        expect(frame.getAttribute('src')).toBe(
          `https://open.spotify.com/embed/artist/${target.artistId}`,
        );
        expect(frame.getAttribute('allow')).toContain('encrypted-media');
        expect(frame.getAttribute('title')).toContain(champion.name);
      }
      expect(button.textContent).toContain(target.actionLabel);
    });
  });

  describe('bracket games', () => {
    beforeEach(() => {
      game.startBracket(METAL, 8);
      while (game.status() === 'playing') {
        game.choose('left');
      }
      fixture = TestBed.createComponent(ResultsPage);
      fixture.detectChanges();
    });

    it('describes the format on the champion card', () => {
      expect(text()).toContain(`${METAL.name} · 8-artist bracket`);
      expect(text()).not.toContain('6 rounds');
    });

    it('draws the bracket instead of a flat list of the beaten artists', () => {
      expect(fixture.nativeElement.querySelector('.bracket')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.defeated')).toBeNull();
      expect(text()).toContain('8 bands · 7 duels');
    });

    it('shows every stage of the knockout, in order', () => {
      const stages = (
        Array.from(fixture.nativeElement.querySelectorAll('.bracket__stage')) as HTMLElement[]
      ).map((element) => element.textContent?.trim());

      expect(stages).toEqual(['Quarter-final', 'Semi-final', 'Final']);
    });

    it('shows one cell per duel, each with the winner advancing', () => {
      const cells = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__duel'),
      ) as HTMLElement[];
      const result = game.result()!;

      expect(cells).toHaveLength(7);
      expect(cells[0].querySelector('.bracket__winner')?.textContent?.trim()).toBe(
        result.matchups[0].winner.name,
      );
      expect(cells[0].querySelector('.bracket__loser')?.textContent?.trim()).toBe(
        result.matchups[0].loser.name,
      );
    });

    it('shows the tree without any "Out in …" line eating the space', () => {
      // The bracket itself carries the structure, so the per-duel stage label is
      // gone — and the round wording belongs to standard play only.
      expect(fixture.nativeElement.querySelector('.bracket__out')).toBeNull();
      expect(text()).not.toContain('Out in');
    });

    it('draws connectors between the stages, not just side-by-side boxes', () => {
      const bars = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__line--bar'),
      ) as HTMLElement[];
      const arms = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__line--arm'),
      ) as HTMLElement[];
      const gaps = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__gap'),
      ) as HTMLElement[];

      // An 8-artist bracket: two semi-finals out of four quarter-finals, then
      // the final out of the two semi-finals.
      expect(gaps).toHaveLength(2);
      expect(bars).toHaveLength(3);
      expect(arms).toHaveLength(3);
    });

    it('places each connector from the shared bracket geometry', () => {
      const board = bracketBoard(game.result()!)!;
      const first = bracketJoinsByGap(board)[0][0];
      const bar = fixture.nativeElement.querySelector('.bracket__line--bar') as HTMLElement;
      const arm = fixture.nativeElement.querySelector('.bracket__line--arm') as HTMLElement;

      expect(bar.style.top).toBe(`${first.upper * 100}%`);
      expect(bar.style.height).toBe(`${(first.lower - first.upper) * 100}%`);
      // The arm leaves the bar at the height of the duel it feeds.
      expect(arm.style.top).toBe(`${first.target * 100}%`);
    });

    it('crowns the final duel and nothing else', () => {
      const crowned = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__duel--crown'),
      ) as HTMLElement[];
      const result = game.result()!;

      expect(crowned).toHaveLength(1);
      expect(crowned[0].textContent).toContain(result.matchups.at(-1)!.winner.name);
    });

    it('ends the tree at the champion, without repeating them in a column', () => {
      const result = game.result()!;
      const columns = Array.from(
        fixture.nativeElement.querySelectorAll('.bracket__column'),
      ) as HTMLElement[];
      const final = fixture.nativeElement.querySelector('.bracket__duel--crown') as HTMLElement;

      // The final already names the champion, so it is the last thing on the
      // board — no separate champion column to repeat it and eat the width.
      expect(columns).toHaveLength(3);
      expect(fixture.nativeElement.querySelector('.bracket__crown')).toBeNull();
      expect(text()).toContain(result.champion.name);
      expect(final.querySelector('.bracket__winner')?.textContent?.trim()).toBe(
        result.champion.name,
      );
    });

    it('puts the bracket under the champion card', () => {
      const champion = fixture.nativeElement.querySelector('.champion') as HTMLElement;
      const bracket = fixture.nativeElement.querySelector('.bracket') as HTMLElement;

      expect(champion.compareDocumentPosition(bracket)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('never puts the champion in the defeated slot of a duel', () => {
      const champion = game.result()!.champion.name;
      const losers = (
        Array.from(fixture.nativeElement.querySelectorAll('.bracket__loser')) as HTMLElement[]
      ).map((element) => element.textContent?.trim());

      expect(losers).not.toContain(champion);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('ResultsPage Spotify wiring', () => {
  /**
   * Renders the page against a fixed Spotify answer, so both shapes — with and
   * without an artist page — are covered whatever the shuffled champion is.
   */
  async function renderWith(
    answer: Omit<SpotifyTarget, 'embedUrl'> & { embedUrl: string | null },
  ): Promise<ComponentFixture<ResultsPage>> {
    const open = vi.fn().mockResolvedValue(true);
    let stub: SpotifyTarget;

    await TestBed.configureTestingModule({
      imports: [ResultsPage],
      providers: [
        provideRouter([]),
        { provide: SpotifyService, useValue: { target: () => stub, open } },
      ],
    }).compileComponents();

    // The iframe binding is a resource URL, so the stub has to hand over a
    // trusted value exactly as the real service does.
    const sanitizer = TestBed.inject(DomSanitizer);
    stub = {
      ...answer,
      embedUrl: answer.embedUrl
        ? sanitizer.bypassSecurityTrustResourceUrl(answer.embedUrl)
        : null,
    };

    const game = TestBed.inject(GameService);
    game.start(METAL, 4);
    while (game.status() === 'playing') {
      game.choose('left');
    }

    const fixture = TestBed.createComponent(ResultsPage);
    fixture.detectChanges();
    return fixture;
  }

  const EMBED = 'https://open.spotify.com/embed/artist/4dpARuHxo51G3z768sgnrY';

  it('frames the artist player when the catalogue has a Spotify id', async () => {
    const fixture = await renderWith({
      artistId: '4dpARuHxo51G3z768sgnrY',
      embedUrl: EMBED,
      openUrl: 'https://open.spotify.com/artist/4dpARuHxo51G3z768sgnrY',
      actionLabel: 'Open in Spotify',
    });
    const frame = fixture.nativeElement.querySelector('.listen__embed') as HTMLElement;

    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe(EMBED);
    expect(frame.getAttribute('height')).toBe('352');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.getAttribute('allow')).toContain('encrypted-media');
    expect(fixture.nativeElement.querySelector('.cta--spotify').textContent).toContain(
      'Open in Spotify',
    );
  });

  it('offers only the search button when there is no artist page', async () => {
    const fixture = await renderWith({
      artistId: null,
      embedUrl: null,
      openUrl: 'https://open.spotify.com/search/Nobody',
      actionLabel: 'Find on Spotify',
    });

    expect(fixture.nativeElement.querySelector('.listen__embed')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cta--spotify').textContent).toContain(
      'Find on Spotify',
    );
    expect(fixture.nativeElement.textContent).toContain('searches Spotify for them instead');
  });
});
