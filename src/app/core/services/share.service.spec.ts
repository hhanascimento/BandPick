import { TestBed } from '@angular/core/testing';
import { GENRES } from '../data/genres.data';
import type { GameResult } from '../models/game.model';
import { summarise, type PlayedGame } from '../models/stats.model';
import { GameService } from './game.service';
import { ShareService } from './share.service';

/** Plays a short game and returns the finished result. */
function finishedGame(rounds = 6): GameResult {
  const game = new GameService();
  game.start(GENRES[0], rounds);
  while (game.status() === 'playing') {
    game.choose('left');
  }
  const result = game.result();
  if (!result) {
    throw new Error('Expected the game to finish with a result.');
  }
  return result;
}

describe('ShareService', () => {
  let share: ShareService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    share = TestBed.inject(ShareService);
  });

  describe('buildText', () => {
    it('names the champion, genre and round count', () => {
      const result = finishedGame(6);
      const text = share.buildText(result);

      expect(text).toContain(result.champion.name);
      expect(text).toContain(result.genre.name);
      expect(text).toContain('6 rounds');
    });

    it('lists every defeated artist', () => {
      const result = finishedGame(9);
      const text = share.buildText(result);

      expect(result.eliminations).toHaveLength(9);
      for (const elimination of result.eliminations) {
        expect(text).toContain(`• ${elimination.artist.name}`);
      }
    });

    it('describes a bracket by its size rather than a round count', () => {
      const game = new GameService();
      game.startBracket(GENRES[0], 16);
      while (game.status() === 'playing') {
        game.choose('left');
      }

      const text = share.buildText(game.result()!);
      expect(text).toContain('16-band');
      expect(text).not.toContain('rounds of');
    });

    it('leaves the champion out of the defeated list', () => {
      const result = finishedGame(5);
      const lines = share.buildText(result).split('\n');
      const bulleted = lines.filter((line) => line.startsWith('• '));

      expect(bulleted).toHaveLength(result.eliminations.length);
      expect(bulleted).not.toContain(`• ${result.champion.name}`);
    });
  });

  describe('copyText', () => {
    it('writes the caption to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const result = finishedGame(4);
      const outcome = await share.copyText(result);

      expect(outcome).toBe('copied');
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0][0]).toContain(result.champion.name);
    });
  });

  describe('buildStatsText', () => {
    /** A two-game log: one standard, one bracket, one band crowned twice. */
    function statsSummary() {
      const games: PlayedGame[] = [
        {
          format: 'gauntlet',
          genreId: GENRES[0].id,
          genreName: GENRES[0].name,
          championId: 'radiohead',
          championName: 'Radiohead',
          rounds: 6,
          finishedAt: 1_000,
        },
        {
          format: 'gauntlet',
          genreId: GENRES[0].id,
          genreName: GENRES[0].name,
          championId: 'radiohead',
          championName: 'Radiohead',
          rounds: 4,
          finishedAt: 2_000,
        },
        {
          format: 'bracket',
          genreId: GENRES[1].id,
          genreName: GENRES[1].name,
          championId: 'queen',
          championName: 'Queen',
          rounds: 3,
          bracketSize: 8,
          finishedAt: 3_000,
        },
      ];
      return summarise(games);
    }

    it('names the totals, the split and the podium', () => {
      const summary = statsSummary();
      const text = share.buildStatsText(summary);

      expect(text).toContain('3 games played');
      expect(text).toContain('2 standard, 1 bracket');
      // 6 + 4 rounds, plus the 7 duels of an 8-artist bracket.
      expect(text).toContain('17 duels');
      expect(text).toContain('Radiohead');
      expect(text).toContain('🥇');
      expect(text).toContain('2 crowns');
    });

    it('names the favourite lane when one exists', () => {
      const text = share.buildStatsText(statsSummary());

      expect(text).toContain(GENRES[0].name);
      expect(text).toContain('Favourite lane');
    });
  });

  describe('describeOutcome', () => {
    it('words the toast for each outcome, per subject', () => {
      expect(share.describeOutcome('shared')).toContain('champion');
      expect(share.describeOutcome('shared', 'stats')).toContain('stats');
      expect(share.describeOutcome('copied')).toBe('Caption copied to the clipboard.');
      expect(share.describeOutcome('dismissed')).toBe('Sharing cancelled.');
      expect(share.describeOutcome('unavailable')).toContain('Copy');
    });
  });
});
