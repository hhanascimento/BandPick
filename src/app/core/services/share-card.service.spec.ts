import { TestBed } from '@angular/core/testing';
import { GENRES } from '../data/genres.data';
import type { GameResult } from '../models/game.model';
import { GameService } from './game.service';
import { ShareCardService } from './share-card.service';

const METAL = GENRES.find((genre) => genre.id === 'metal')!;

/** Everything the card drew, recorded so the drawing itself can be asserted. */
interface Drawing {
  texts: string[];
  strokes: number;
}

/**
 * A stand-in 2D context. jsdom has no canvas at all (see src/test-setup.ts), so
 * this records the calls instead: `measureText` reports a narrow width, which
 * leaves every artist name whole and therefore comparable.
 */
function fakeContext(drawing: Drawing): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const context = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    rect: () => undefined,
    fill: () => undefined,
    clip: () => undefined,
    fillRect: () => undefined,
    stroke: () => {
      drawing.strokes += 1;
    },
    fillText: (text: string) => {
      drawing.texts.push(text);
    },
    measureText: (text: string) => ({ width: text.length * 4 }) as TextMetrics,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return context as unknown as CanvasRenderingContext2D;
}

function playToEnd(setup: (game: GameService) => void): GameResult {
  const game = new GameService();
  setup(game);
  while (game.status() === 'playing') {
    game.choose('left');
  }
  const result = game.result();
  if (!result) {
    throw new Error('Expected the game to finish with a result.');
  }
  return result;
}

describe('ShareCardService', () => {
  let cards: ShareCardService;
  let drawing: Drawing;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    cards = TestBed.inject(ShareCardService);
    drawing = { texts: [], strokes: 0 };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext(drawing));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a PNG data URL', () => {
    const result = playToEnd((game) => game.start(METAL, 6));

    expect(cards.toDataUrl(result)).toBe('data:image/png;base64,AAAA');
  });

  it('reports no card when the platform has no canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const result = playToEnd((game) => game.start(METAL, 4));

    expect(cards.toDataUrl(result)).toBeNull();
  });

  it('caches by game, so sharing twice does not redraw', () => {
    const result = playToEnd((game) => game.start(METAL, 5));
    cards.toDataUrl(result);
    const afterFirst = drawing.texts.length;

    cards.toDataUrl(result);
    expect(drawing.texts.length).toBe(afterFirst);
  });

  it('lists the artists beaten on a survivor streak', () => {
    const result = playToEnd((game) => game.start(METAL, 5));
    cards.toDataUrl(result);

    for (const elimination of result.eliminations) {
      expect(drawing.texts).toContain(elimination.artist.name);
    }
    expect(drawing.texts).toContain(result.champion.name);
    // 'CHAMPION' appears once, in the header: a streak has no tree to crown.
    expect(drawing.texts.filter((text) => text === 'CHAMPION')).toHaveLength(1);
  });

  it('labels a survivor streak by the artists it beat', () => {
    const result = playToEnd((game) => game.start(METAL, 5));
    cards.toDataUrl(result);

    expect(drawing.texts).toContain('BEAT 5 BANDS');
    expect(drawing.texts).not.toContain('BRACKET');
  });

  it('labels a knockout by its format, not by a count of the beaten', () => {
    const result = playToEnd((game) => game.startBracket(METAL, 16));
    cards.toDataUrl(result);

    expect(drawing.texts).toContain('BRACKET');
    expect(drawing.texts.some((label) => label.startsWith('BEAT'))).toBe(false);
  });

  it('draws a knockout as the bracket, with every duel of the tree', () => {
    const result = playToEnd((game) => game.startBracket(METAL, 16));
    cards.toDataUrl(result);

    expect(result.matchups).toHaveLength(15);
    for (const matchup of result.matchups) {
      expect(drawing.texts).toContain(matchup.winner.name);
      expect(drawing.texts).toContain(matchup.loser.name);
    }

    // Once in the header, once in the final box of the tree.
    expect(drawing.texts.filter((text) => text === 'CHAMPION')).toHaveLength(2);
  });

  it('draws a tree for a knockout and only a list for a streak', () => {
    const streak = playToEnd((game) => game.start(METAL, 7));
    cards.toDataUrl(streak);
    const streakStrokes = drawing.strokes;

    drawing.texts.length = 0;
    drawing.strokes = 0;

    const bracket = playToEnd((game) => game.startBracket(METAL, 8));
    cards.toDataUrl(bracket);

    // Seven duel boxes and three connector joins add geometry a list never has.
    expect(streakStrokes).toBeGreaterThan(0);
    expect(drawing.strokes).toBeGreaterThan(streakStrokes);
  });
});
