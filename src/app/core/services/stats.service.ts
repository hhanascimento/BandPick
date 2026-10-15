import { Injectable, computed, signal } from '@angular/core';
import type { GameResult } from '../models/game.model';
import {
  playedGameFrom,
  summarise,
  type PlayedGame,
  type StatsSummary,
} from '../models/stats.model';

const STORAGE_KEY = 'bandpick.stats.v1';

/**
 * Cap on the log, oldest games dropped first, so localStorage can never grow
 * without bound. 500 games is years of casual play; the headline counts stay
 * exact only up to that point, which is a fair trade for never losing a
 * device's storage quota.
 */
const MAX_GAMES = 500;

/** Guards the log against a corrupt or hand-edited storage entry. */
function isPlayedGame(value: unknown): value is PlayedGame {
  const game = value as Partial<PlayedGame>;
  return (
    typeof game === 'object' &&
    game !== null &&
    (game.format === 'gauntlet' || game.format === 'bracket') &&
    typeof game.genreId === 'string' &&
    typeof game.championId === 'string' &&
    typeof game.championName === 'string' &&
    typeof game.rounds === 'number' &&
    typeof game.finishedAt === 'number'
  );
}

function loadGames(): PlayedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isPlayedGame).slice(-MAX_GAMES);
  } catch {
    // Unreadable storage (corrupt JSON, private mode, quota): start empty
    // rather than crash the app over statistics.
    return [];
  }
}

/**
 * Remembers every finished game so the stats screen has something to show.
 *
 * The log lives in localStorage — no account, no network, and it survives
 * restarts on both the web and the Android WebView. `GameService` calls
 * {@link record} the moment a crown is decided, so a game counts whether or
 * not the player ever opens the results screen.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly _games = signal<readonly PlayedGame[]>(loadGames());

  /** The raw log, newest last. */
  readonly games = this._games.asReadonly();

  /** Every displayed stat, derived from the log in one pass. */
  readonly summary = computed<StatsSummary>(() => summarise(this._games()));

  /** Appends a finished game and persists the log. */
  record(result: GameResult): void {
    const next = [...this._games(), playedGameFrom(result)].slice(-MAX_GAMES);
    this._games.set(next);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode or quota exceeded: the stat still counts for this
      // session; losing persistence is better than breaking the results screen.
    }
  }
}
