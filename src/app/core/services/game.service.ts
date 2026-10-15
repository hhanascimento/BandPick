import { Injectable, computed, signal } from '@angular/core';
import type { Artist } from '../models/artist.model';
import type { Genre } from '../models/genre.model';
import type {
  BracketDetails,
  BracketStage,
  Elimination,
  GameFormat,
  GameResult,
  Matchup,
  Pairing,
  Side,
} from '../models/game.model';
import { StatsService } from './stats.service';

export type GameStatus = 'idle' | 'playing' | 'finished';

/** Thrown when a game cannot be started with the requested settings. */
export class InvalidGameSetupError extends Error {}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * What each knockout round is called, keyed by how many duels it contains.
 * A 16-artist bracket opens with eight duels (the round of 16); an 8-artist
 * bracket opens with four (the quarter-finals).
 */
const STAGE_NAMES: Readonly<Record<number, string>> = {
  8: 'Round of 16',
  4: 'Quarter-final',
  2: 'Semi-final',
  1: 'Final',
};

/**
 * Drives both game formats.
 *
 * **Standard (gauntlet)** — two artists face off; the one the player taps keeps
 * its tile and a brand new challenger takes the opposite tile, until the
 * requested number of rounds is played. A game of N rounds therefore uses N + 1
 * artists and produces N eliminations.
 *
 * **Bracket** — a single-elimination knockout of 8 or 16 artists. Everyone is
 * paired off, each duel's winner advances and each loser is out; the last stage
 * is the final. A bracket of S artists runs for log2(S) stage rounds, and the
 * champion survives one duel per stage.
 *
 * Either way the longest standard game is {@link MAX_ROUNDS} rounds, so the
 * shortest genre needs MAX_ROUNDS + 1 artists available; a bracket needs as many
 * artists as it has entrants.
 *
 * There is deliberately no scoring — winning is purely "you picked me last".
 *
 * State is held in signals so it works with Angular's zoneless change detection.
 */
@Injectable({ providedIn: 'root' })
export class GameService {
  /**
   * Every finished game is logged for the stats screen. The parameter is
   * optional so the service can still be constructed directly (`new
   * GameService()`) in unit tests, where there is no injector to supply one.
   *
   * `inject()` cannot be used here on purpose: it throws outside an injection
   * context, and the unit tests deliberately build this service by hand.
   */
  // eslint-disable-next-line @angular-eslint/prefer-inject -- see the doc comment above
  constructor(private readonly stats: StatsService | null = null) {}

  static readonly MIN_ROUNDS = 1;
  static readonly MAX_ROUNDS = 20;

  /** Bracket sizes the setup screen offers. Powers of two, capped at 16. */
  static readonly BRACKET_SIZES = [8, 16] as const;
  static readonly MAX_BRACKET_SIZE = 16;

  private readonly _format = signal<GameFormat>('gauntlet');
  private readonly _genre = signal<Genre | null>(null);
  private readonly _totalRounds = signal(0);
  private readonly _round = signal(0);
  private readonly _pairing = signal<Pairing | null>(null);
  private readonly _eliminations = signal<readonly Elimination[]>([]);
  private readonly _matchups = signal<readonly Matchup[]>([]);
  private readonly _result = signal<GameResult | null>(null);
  private readonly _bracket = signal<BracketDetails | null>(null);
  private readonly _tie = signal(0);

  /** Remaining artists to introduce, one per round, in shuffled order. */
  private pool: readonly Artist[] = [];

  /** Bracket bookkeeping: artists still to play this stage, and its winners. */
  private bracketQueue: readonly Artist[] = [];
  private bracketWinners: Artist[] = [];

  readonly format = this._format.asReadonly();
  readonly genre = this._genre.asReadonly();
  readonly totalRounds = this._totalRounds.asReadonly();
  readonly round = this._round.asReadonly();
  readonly pairing = this._pairing.asReadonly();
  readonly eliminations = this._eliminations.asReadonly();
  readonly matchups = this._matchups.asReadonly();
  readonly result = this._result.asReadonly();
  readonly bracket = this._bracket.asReadonly();

  readonly status = computed<GameStatus>(() => {
    if (this._result()) {
      return 'finished';
    }
    return this._pairing() ? 'playing' : 'idle';
  });

  /** 0 → 1, for the progress bar. */
  readonly progress = computed(() => {
    const total = this.duelsTotal();
    return total === 0 ? 0 : this._matchups().length / total;
  });

  /**
   * Every duel the game will ask the player to decide.
   *
   * N in a gauntlet, but S - 1 in a bracket: a 16-artist knockout is 15 duels,
   * while the champion only survives 4 of them. The progress bar measures the
   * former and the results screen celebrates the latter, hence two numbers.
   */
  readonly duelsTotal = computed(() => {
    const details = this._bracket();
    return details ? details.size - 1 : this._totalRounds();
  });

  /** Duels decided so far across the whole game. */
  readonly duelsPlayed = computed(() => this._matchups().length);

  /** Name of the bracket round being played, or null in a gauntlet. */
  readonly stageName = computed(() => {
    const details = this._bracket();
    if (!details) {
      return null;
    }
    const stage = details.stages.find((candidate) => candidate.number === this._round());
    return stage?.name ?? null;
  });

  /** 1-based duel number within the current bracket stage; 0 in a gauntlet. */
  readonly tieNumber = computed(() =>
    this._bracket() ? Math.min(this._tie() + 1, this.tiesInStage()) : 0,
  );

  /** How many duels the current bracket stage contains; 0 in a gauntlet. */
  readonly tiesInStage = computed(() => {
    const details = this._bracket();
    if (!details) {
      return 0;
    }
    return details.stages.find((stage) => stage.number === this._round())?.ties ?? 0;
  });

  /**
   * Highest round count a genre can support. Every shipped genre has well over
   * MAX_ROUNDS + 1 artists, so this is normally MAX_ROUNDS, but the guard keeps
   * unusual data from breaking a game.
   */
  maxRoundsFor(genre: Genre | null | undefined): number {
    if (!genre) {
      return 0;
    }
    return Math.min(GameService.MAX_ROUNDS, Math.max(0, genre.artists.length - 1));
  }

  /** Largest bracket a genre can field — a power of two, never above 16. */
  maxBracketSizeFor(genre: Genre | null | undefined): number {
    if (!genre) {
      return 0;
    }
    const affordable = [...GameService.BRACKET_SIZES]
      .filter((size) => size <= genre.artists.length)
      .pop();
    return affordable ?? 0;
  }

  /** Begins a fresh standard game, discarding any game in progress. */
  start(genre: Genre, requestedRounds: number): void {
    const available = this.maxRoundsFor(genre);
    if (available < GameService.MIN_ROUNDS) {
      throw new InvalidGameSetupError(
        `"${genre.name}" does not have enough artists to play a round.`,
      );
    }

    const rounds = Math.min(
      GameService.MAX_ROUNDS,
      Math.max(GameService.MIN_ROUNDS, Math.floor(requestedRounds)),
    );
    if (rounds > available) {
      throw new InvalidGameSetupError(
        `"${genre.name}" supports at most ${available} rounds.`,
      );
    }

    // N rounds need N + 1 artists: one champion plus one new challenger per round.
    this.pool = shuffled(genre.artists).slice(0, rounds + 1);
    this.bracketQueue = [];
    this.bracketWinners = [];

    this._format.set('gauntlet');
    this._bracket.set(null);
    this._tie.set(0);
    this._genre.set(genre);
    this._totalRounds.set(rounds);
    this._round.set(1);
    this._eliminations.set([]);
    this._matchups.set([]);
    this._result.set(null);
    this._pairing.set({ left: this.pool[0], right: this.pool[1] });
  }

  /**
   * Begins a single-elimination knockout. `size` artists enter, half of them go
   * out in the opening stage, and the winner of the final is champion.
   */
  startBracket(genre: Genre, size: number): void {
    const requested = Math.floor(size);
    if (!GameService.BRACKET_SIZES.includes(requested as (typeof GameService.BRACKET_SIZES)[number])) {
      throw new InvalidGameSetupError(
        `A bracket needs ${GameService.BRACKET_SIZES.join(' or ')} artists.`,
      );
    }
    if (genre.artists.length < requested) {
      throw new InvalidGameSetupError(
        `"${genre.name}" does not have enough artists for a ${requested}-artist bracket.`,
      );
    }

    const stages: BracketStage[] = [];
    for (let ties = requested / 2; ties >= 1; ties /= 2) {
      stages.push({
        number: stages.length + 1,
        name: STAGE_NAMES[ties] ?? `Round ${stages.length + 1}`,
        ties,
      });
    }

    const entrants = shuffled(genre.artists).slice(0, requested);
    this.pool = [];
    this.bracketQueue = entrants;
    this.bracketWinners = [];

    this._format.set('bracket');
    this._bracket.set({ size: requested, stages });
    this._tie.set(0);
    this._genre.set(genre);
    // The champion survives one duel per stage, so the stage count is the
    // number of rounds it takes to win.
    this._totalRounds.set(stages.length);
    this._round.set(1);
    this._eliminations.set([]);
    this._matchups.set([]);
    this._result.set(null);
    this._pairing.set({ left: entrants[0], right: entrants[1] });
  }

  /**
   * Records the player's pick.
   *
   * In a gauntlet the chosen artist keeps its tile so the player can see their
   * champion survive. In a bracket the winner advances to the next duel — or the
   * next stage — and the loser is out for good.
   */
  choose(side: Side): void {
    const pairing = this._pairing();
    if (!pairing || this._result()) {
      return;
    }

    const winner = pairing[side];
    const loser = side === 'left' ? pairing.right : pairing.left;
    const stageName = this.stageName();

    this._eliminations.update((list) => [
      ...list,
      { artist: loser, round: this._round(), ...(stageName ? { stageName } : {}) },
    ]);
    this._matchups.update((list) => [
      ...list,
      { round: this._round(), left: pairing.left, right: pairing.right, winner, loser },
    ]);

    if (this._format() === 'bracket') {
      this.advanceBracket(winner);
      return;
    }

    if (this._round() >= this._totalRounds()) {
      this.finish(winner);
      return;
    }

    const nextRound = this._round() + 1;
    const challenger = this.pool[nextRound];

    this._pairing.set(
      side === 'left'
        ? { left: winner, right: challenger }
        : { left: challenger, right: winner },
    );
    this._round.set(nextRound);
  }

  /** Replays with the same genre, format and size, reshuffling the line-up. */
  restart(): void {
    const genre = this._genre();
    const details = this._bracket();
    if (!genre) {
      return;
    }
    if (details) {
      this.startBracket(genre, details.size);
      return;
    }
    const rounds = this._totalRounds();
    if (rounds > 0) {
      this.start(genre, rounds);
    }
  }

  /** Back to a clean slate (used when leaving to the home screen). */
  reset(): void {
    this.pool = [];
    this.bracketQueue = [];
    this.bracketWinners = [];
    this._format.set('gauntlet');
    this._bracket.set(null);
    this._tie.set(0);
    this._genre.set(null);
    this._totalRounds.set(0);
    this._round.set(0);
    this._pairing.set(null);
    this._eliminations.set([]);
    this._matchups.set([]);
    this._result.set(null);
  }

  /** Moves a bracket on to the next duel, or the next stage, or the crown. */
  private advanceBracket(winner: Artist): void {
    this.bracketWinners = [...this.bracketWinners, winner];
    this.bracketQueue = this.bracketQueue.slice(2);

    if (this.bracketQueue.length >= 2) {
      this._tie.update((tie) => tie + 1);
      this._pairing.set({ left: this.bracketQueue[0], right: this.bracketQueue[1] });
      return;
    }

    // The stage is complete. The final's winner is the champion; any earlier
    // stage hands its winners to the next round.
    const finalStage = this._round() >= this._totalRounds();
    if (finalStage) {
      this.finish(winner);
      return;
    }

    const next = this.bracketWinners;
    this.bracketWinners = [];
    this.bracketQueue = next;
    this._tie.set(0);
    this._round.update((round) => round + 1);
    this._pairing.set({ left: next[0], right: next[1] });
  }

  private finish(champion: Artist): void {
    const genre = this._genre();
    if (!genre) {
      return;
    }
    const details = this._bracket();
    this._pairing.set(null);
    const result: GameResult = {
      genre,
      format: this._format(),
      totalRounds: this._totalRounds(),
      ...(details ? { bracket: details } : {}),
      champion,
      eliminations: this._eliminations(),
      matchups: this._matchups(),
    };
    this._result.set(result);
    // Logged here — the single moment a crown is decided — so the stats count
    // a game even when the player never opens the results screen.
    this.stats?.record(result);
  }
}
