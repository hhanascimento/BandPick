import type { Artist } from './artist.model';
import type { GameFormat, GameResult } from './game.model';

/**
 * One finished game, as the stats log stores it.
 *
 * Deliberately denormalised — genre and champion names are copied in, not
 * referenced — so a stat recorded against an older catalogue still reads
 * correctly after artists are renamed or removed.
 */
export interface PlayedGame {
  readonly format: GameFormat;
  readonly genreId: string;
  readonly genreName: string;
  readonly championId: string;
  readonly championName: string;
  /**
   * Rounds the champion survived: the requested count in a gauntlet, the stage
   * count in a bracket.
   */
  readonly rounds: number;
  /** Bracket play only: how many bands entered. */
  readonly bracketSize?: number;
  /** Epoch ms when the crown was decided. */
  readonly finishedAt: number;
}

/** A band's place on the podium. */
export interface ChampionStat {
  /** Reconstructed from the log; the photo resolves from the artist id. */
  readonly artist: Artist;
  readonly wins: number;
  /** When it was crowned most recently — breaks ties between equal win counts. */
  readonly lastWonAt: number;
}

/** The genre the player reached for most often. */
export interface GenreStat {
  readonly genreId: string;
  readonly genreName: string;
  readonly games: number;
}

/** Everything the stats screen and the stats card show. */
export interface StatsSummary {
  readonly gamesPlayed: number;
  readonly standardGames: number;
  readonly bracketGames: number;
  /** Duels the player actually decided — rounds in a gauntlet, S − 1 per bracket. */
  readonly duelsPlayed: number;
  /** How many different bands have been crowned. */
  readonly crowned: number;
  /** Top three by wins, best first. */
  readonly podium: readonly ChampionStat[];
  readonly favouriteGenre: GenreStat | null;
  /** Most rounds survived in a single standard game. */
  readonly longestStreak: number;
  /** Largest bracket conquered; 0 when no bracket has been played. */
  readonly biggestBracket: number;
  /** Epoch ms of the first game on record, or null when nothing is recorded. */
  readonly firstPlayedAt: number | null;
}

/** Snapshots a finished game into the log's own record shape. */
export function playedGameFrom(result: GameResult): PlayedGame {
  return {
    format: result.format,
    genreId: result.genre.id,
    genreName: result.genre.name,
    championId: result.champion.id,
    championName: result.champion.name,
    rounds: result.totalRounds,
    ...(result.bracket ? { bracketSize: result.bracket.size } : {}),
    finishedAt: Date.now(),
  };
}

/**
 * Derives every stat the screen shows from the raw log.
 *
 * Pure, so the page, the share text and the share card all read one
 * computation and can never disagree. Podium ties go to the band crowned most
 * recently, then to alphabetical order, so the ranking is fully deterministic.
 */
export function summarise(games: readonly PlayedGame[]): StatsSummary {
  let standardGames = 0;
  let bracketGames = 0;
  let duelsPlayed = 0;
  let longestStreak = 0;
  let biggestBracket = 0;
  let firstPlayedAt: number | null = null;

  const champions = new Map<string, { name: string; wins: number; lastWonAt: number }>();
  const genres = new Map<string, { name: string; games: number }>();

  for (const game of games) {
    if (game.format === 'bracket') {
      bracketGames++;
      const size = game.bracketSize ?? 0;
      biggestBracket = Math.max(biggestBracket, size);
      duelsPlayed += Math.max(0, size - 1);
    } else {
      standardGames++;
      longestStreak = Math.max(longestStreak, game.rounds);
      duelsPlayed += game.rounds;
    }

    const champion = champions.get(game.championId) ?? {
      name: game.championName,
      wins: 0,
      lastWonAt: 0,
    };
    champions.set(game.championId, {
      name: champion.name,
      wins: champion.wins + 1,
      lastWonAt: Math.max(champion.lastWonAt, game.finishedAt),
    });

    const genre = genres.get(game.genreId) ?? { name: game.genreName, games: 0 };
    genres.set(game.genreId, { name: genre.name, games: genre.games + 1 });

    firstPlayedAt = firstPlayedAt === null ? game.finishedAt : Math.min(firstPlayedAt, game.finishedAt);
  }

  const podium = [...champions.entries()]
    .map(([id, entry]) => ({
      artist: { id, name: entry.name },
      wins: entry.wins,
      lastWonAt: entry.lastWonAt,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.lastWonAt - a.lastWonAt ||
        a.artist.name.localeCompare(b.artist.name),
    )
    .slice(0, 3);

  const favouriteGenre =
    [...genres.entries()]
      .map(([genreId, entry]) => ({ genreId, genreName: entry.name, games: entry.games }))
      .sort((a, b) => b.games - a.games || a.genreName.localeCompare(b.genreName))[0] ?? null;

  return {
    gamesPlayed: games.length,
    standardGames,
    bracketGames,
    duelsPlayed,
    crowned: champions.size,
    podium,
    favouriteGenre,
    longestStreak,
    biggestBracket,
    firstPlayedAt,
  };
}
