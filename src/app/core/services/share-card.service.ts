import { Injectable } from '@angular/core';
import { formatLabel, type GameResult } from '../models/game.model';
import type { StatsSummary } from '../models/stats.model';
import {
  bracketBoard,
  bracketCentre,
  bracketJoins,
  type BracketBoard,
} from '../../shared/bracket-board';
import { gradientStopsFor, hueFor, initialsFor } from '../../shared/artist-art';

/** Instagram-friendly 4:5 portrait card. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Draws the "my champion" result card.
 *
 * A canvas is used rather than a DOM screenshot so the output is identical on
 * every device, needs no extra dependency, and can be produced without the
 * results screen being laid out in a particular way.
 */
@Injectable({ providedIn: 'root' })
export class ShareCardService {
  private readonly cache = new Map<string, string>();

  /** Renders the card as a PNG data URL, or `null` when canvas is unavailable. */
  toDataUrl(result: GameResult): string | null {
    const key = this.cacheKey(result);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      this.draw(ctx, result);

      const dataUrl = canvas.toDataURL('image/png');
      this.cache.set(key, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }

  /** The card as a PNG blob, used for the native/Web Share file payload. */
  async toBlob(result: GameResult): Promise<Blob | null> {
    const dataUrl = this.toDataUrl(result);
    if (!dataUrl) {
      return null;
    }
    try {
      const response = await fetch(dataUrl);
      return await response.blob();
    } catch {
      return null;
    }
  }

  /** Base64 payload (no data-URL prefix) for the Capacitor Filesystem plugin. */
  async toBase64(result: GameResult): Promise<string | null> {
    const dataUrl = this.toDataUrl(result);
    return dataUrl ? dataUrl.split(',')[1] ?? null : null;
  }

  /** Renders the lifetime-stats card as a PNG data URL. */
  toStatsDataUrl(summary: StatsSummary): string | null {
    const key = this.statsCacheKey(summary);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      this.drawStats(ctx, summary);

      const dataUrl = canvas.toDataURL('image/png');
      this.cache.set(key, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }

  /** The stats card as a PNG blob, for the native/Web Share file payload. */
  async toStatsBlob(summary: StatsSummary): Promise<Blob | null> {
    const dataUrl = this.toStatsDataUrl(summary);
    if (!dataUrl) {
      return null;
    }
    try {
      const response = await fetch(dataUrl);
      return await response.blob();
    } catch {
      return null;
    }
  }

  /** Base64 stats card (no data-URL prefix) for the Capacitor Filesystem plugin. */
  async toStatsBase64(summary: StatsSummary): Promise<string | null> {
    const dataUrl = this.toStatsDataUrl(summary);
    return dataUrl ? dataUrl.split(',')[1] ?? null : null;
  }

  private cacheKey(result: GameResult): string {
    return [
      result.genre.id,
      result.format,
      result.bracket?.size ?? result.totalRounds,
      result.champion.id,
      ...result.eliminations.map((elimination) => elimination.artist.id),
    ].join('|');
  }

  /** Stats change with every recorded game, so the whole summary keys the cache. */
  private statsCacheKey(summary: StatsSummary): string {
    return [
      'stats',
      summary.gamesPlayed,
      summary.standardGames,
      summary.bracketGames,
      summary.duelsPlayed,
      ...summary.podium.map((entry) => `${entry.artist.id}:${entry.wins}`),
    ].join('|');
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private draw(ctx: CanvasRenderingContext2D, result: GameResult): void {
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;

    // Background wash.
    const background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, '#1b1038');
    background.addColorStop(0.55, '#0c0716');
    background.addColorStop(1, '#170a2b');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    // Two soft glows tinted from the champion's own generated colour.
    this.glow(ctx, W * 0.18, H * 0.1, 520, result.champion.name, 0.42);
    this.glow(ctx, W * 0.88, H * 0.85, 460, result.genre.id, 0.3);

    // Inner frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 36, 36, W - 72, H - 72, 44);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Header.
    ctx.fillStyle = 'rgba(245,243,255,0.55)';
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.fillText('BANDPICK', W / 2, 152);

    ctx.fillStyle = '#fbbf24';
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.fillText('CHAMPION', W / 2, 224);

    // Champion monogram.
    const monogram = initialsFor(result.champion.name);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, 350, 66, 0, Math.PI * 2);
    ctx.clip();
    const [monogramFrom, monogramTo] = gradientStopsFor(result.champion.name);
    const monogramGradient = ctx.createLinearGradient(W / 2 - 66, 284, W / 2 + 66, 416);
    monogramGradient.addColorStop(0, monogramFrom);
    monogramGradient.addColorStop(1, monogramTo);
    ctx.fillStyle = monogramGradient;
    ctx.fillRect(W / 2 - 66, 284, 132, 132);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `800 60px ${FONT_STACK}`;
    ctx.fillText(monogram, W / 2, 372);

    // Champion name.
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 92px ${FONT_STACK}`;
    const nameBottom = this.drawWrapped(ctx, result.champion.name, W / 2, 530, W - 200, 100);

    // Genre + round count pill.
    const pillLabel = `${result.genre.name} · ${formatLabel(result)}`;
    ctx.font = `700 32px ${FONT_STACK}`;
    const pillWidth = Math.min(W - 200, ctx.measureText(pillLabel).width + 76);
    const pillTop = nameBottom + 26;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    this.roundRect(ctx, (W - pillWidth) / 2, pillTop, pillWidth, 62, 31);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, (W - pillWidth) / 2, pillTop, pillWidth, 62, 31);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,243,255,0.92)';
    ctx.fillText(pillLabel, W / 2, pillTop + 42);

    // Divider.
    const dividerY = pillTop + 122;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, dividerY);
    ctx.lineTo(W - 110, dividerY);
    ctx.stroke();

    // A survivor streak is a tally of who was beaten, so it says so. A knockout
    // is a tree — "beat 15 artists" is just a fact about a bracket, not the shape
    // of the game, so that line names the format instead.
    const board = bracketBoard(result);
    const listLabel = board ? 'BRACKET' : `BEAT ${result.eliminations.length} BANDS`;

    ctx.fillStyle = 'rgba(245,243,255,0.5)';
    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.fillText(listLabel, W / 2, dividerY + 56);

    const listTop = dividerY + 92;
    const listBottom = H - 148;

    // A knockout is shared as the tree it was played as; a survivor streak has
    // no shape beyond the list, so it keeps the two balanced columns.
    if (board) {
      this.drawBracket(ctx, board, listTop, listBottom);
    } else {
      this.drawEliminations(ctx, result, listTop, listBottom);
    }

    // Footer. The bracket draws its own labels left-aligned, so the alignment
    // is reset here rather than relied upon from the header.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,243,255,0.42)';
    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillText('No scores. No timers. Just your taste.', W / 2, H - 84);
  }

  /** The beaten artists of a survivor streak, in two balanced columns. */
  private drawEliminations(
    ctx: CanvasRenderingContext2D,
    result: GameResult,
    listTop: number,
    listBottom: number,
  ): void {
    const rows = Math.ceil(result.eliminations.length / 2);
    const lineHeight = Math.min(50, (listBottom - listTop) / Math.max(rows, 1));
    const fontSize = Math.max(18, Math.min(31, Math.round(lineHeight * 0.62)));
    const columnWidth = CARD_WIDTH / 2 - 92;

    ctx.textAlign = 'center';
    ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(245,243,255,0.86)';

    const columns: [number, number] = [CARD_WIDTH * 0.27, CARD_WIDTH * 0.73];
    result.eliminations.forEach((elimination, index) => {
      const column = index < rows ? 0 : 1;
      const row = index < rows ? index : index - rows;
      const label = this.truncate(ctx, elimination.artist.name, columnWidth);
      ctx.fillText(label, columns[column], listTop + row * lineHeight + fontSize);
    });
  }

  /**
   * The knockout tree, drawn as a tree.
   *
   * The opening round fixes the row height, and every later duel sits at the
   * midpoint of the two duels that fed it — the standard bracket geometry, which
   * needs no per-column measuring and never produces crossing lines.
   */
  private drawBracket(
    ctx: CanvasRenderingContext2D,
    board: BracketBoard,
    top: number,
    bottom: number,
  ): void {
    const columns = board.columns;
    const firstRound = columns[0].duels.length;
    const left = 92;
    const right = CARD_WIDTH - 92;
    const gap = 18;
    const boxWidth = (right - left - gap * (columns.length - 1)) / columns.length;
    const height = bottom - top;
    const rowHeight = height / Math.max(firstRound, 1);
    const boxHeight = Math.max(32, Math.min(56, rowHeight - 8));
    const radius = Math.min(12, boxHeight / 3);

    const columnX = (index: number): number => left + index * (boxWidth + gap);
    /** Centre of duel `index` in `column`, from the shared geometry. */
    const centreY = (column: number, index: number): number =>
      top + height * bracketCentre(column, index, firstRound);

    for (let column = 0; column < columns.length; column++) {
      const x = columnX(column);
      const duels = columns[column].duels;
      const isFinal = column === columns.length - 1;
      const fontSize = Math.max(15, Math.min(25, Math.round(boxHeight * 0.42)));
      const outFontSize = Math.max(11, Math.round(fontSize * 0.72));

      duels.forEach((duel, index) => {
        const centre = centreY(column, index);
        const y = centre - boxHeight / 2;

        ctx.fillStyle = isFinal ? 'rgba(251,191,36,0.16)' : 'rgba(255,255,255,0.06)';
        this.roundRect(ctx, x, y, boxWidth, boxHeight, radius);
        ctx.fill();
        ctx.strokeStyle = isFinal ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 2;
        this.roundRect(ctx, x, y, boxWidth, boxHeight, radius);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.truncate(ctx, duel.winner.name, boxWidth - 22), x + 11, centre - 2);

        ctx.font = `600 ${outFontSize}px ${FONT_STACK}`;
        ctx.fillStyle = 'rgba(245,243,255,0.48)';
        ctx.fillText(
          this.truncate(ctx, duel.loser.name, boxWidth - 22),
          x + 11,
          centre + outFontSize + 5,
        );

        if (isFinal) {
          ctx.textAlign = 'center';
          ctx.font = `800 22px ${FONT_STACK}`;
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('CHAMPION', x + boxWidth / 2, y + boxHeight + 30);
        }
      });
    }

    // Connectors last, so no line is drawn over a name. The joins come from the
    // same geometry the results screen renders, so the tree on screen and the
    // tree on the card cannot drift apart.
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const join of bracketJoins(board)) {
      const fromX = columnX(join.column) + boxWidth;
      const toX = columnX(join.column + 1);
      const midX = (fromX + toX) / 2;
      const upper = top + height * join.upper;
      const lower = top + height * join.lower;
      const target = top + height * join.target;

      ctx.moveTo(fromX, upper);
      ctx.lineTo(midX, upper);
      ctx.moveTo(fromX, lower);
      ctx.lineTo(midX, lower);
      ctx.moveTo(midX, upper);
      ctx.lineTo(midX, lower);
      ctx.moveTo(midX, target);
      ctx.lineTo(toX, target);
    }
    ctx.stroke();
  }

  /**
   * Draws the lifetime-stats card: headline counts, then the podium.
   *
   * Same frame, glow and type treatment as the champion card so the two read
   * as one family when they land in the same feed.
   */
  private drawStats(ctx: CanvasRenderingContext2D, summary: StatsSummary): void {
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;

    const background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, '#1b1038');
    background.addColorStop(0.55, '#0c0716');
    background.addColorStop(1, '#170a2b');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    // Seeded from the favourite genre, or the top band when no genre leads.
    const glowSeed = summary.favouriteGenre?.genreId ?? summary.podium[0]?.artist.name ?? 'BandPick';
    this.glow(ctx, W * 0.18, H * 0.1, 520, glowSeed, 0.42);
    this.glow(ctx, W * 0.88, H * 0.85, 460, summary.podium[0]?.artist.name ?? 'stats', 0.3);

    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 36, 36, W - 72, H - 72, 44);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(245,243,255,0.55)';
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.fillText('BANDPICK', W / 2, 152);

    ctx.fillStyle = '#fbbf24';
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.fillText('MY STATS', W / 2, 224);

    // Headline count.
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 150px ${FONT_STACK}`;
    ctx.fillText(String(summary.gamesPlayed), W / 2, 400);

    ctx.fillStyle = 'rgba(245,243,255,0.6)';
    ctx.font = `700 30px ${FONT_STACK}`;
    ctx.fillText('GAMES PLAYED', W / 2, 452);

    // Standard vs bracket split, as one pill.
    const pillLabel = `${summary.standardGames} standard · ${summary.bracketGames} bracket`;
    ctx.font = `700 32px ${FONT_STACK}`;
    const pillWidth = Math.min(W - 200, ctx.measureText(pillLabel).width + 76);
    const pillTop = 496;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    this.roundRect(ctx, (W - pillWidth) / 2, pillTop, pillWidth, 62, 31);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, (W - pillWidth) / 2, pillTop, pillWidth, 62, 31);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,243,255,0.92)';
    ctx.fillText(pillLabel, W / 2, pillTop + 42);

    // Divider.
    const dividerY = pillTop + 122;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, dividerY);
    ctx.lineTo(W - 110, dividerY);
    ctx.stroke();

    // Podium.
    ctx.fillStyle = 'rgba(245,243,255,0.5)';
    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.fillText('MOST CROWNED', W / 2, dividerY + 56);

    const medals = ['1', '2', '3'];
    const medalHues: Record<string, [string, string]> = {
      '1': ['#fbbf24', '#b45309'],
      '2': ['#e5e7eb', '#6b7280'],
      '3': ['#f59e0b', '#7c2d12'],
    };
    const columnX = [CARD_WIDTH * 0.22, CARD_WIDTH * 0.5, CARD_WIDTH * 0.78];
    const avatarY = dividerY + 190;
    const avatarRadius = 78;

    summary.podium.slice(0, 3).forEach((entry, index) => {
      const x = columnX[index];

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      const [from, to] = gradientStopsFor(entry.artist.name);
      const gradient = ctx.createLinearGradient(
        x - avatarRadius,
        avatarY - avatarRadius,
        x + avatarRadius,
        avatarY + avatarRadius,
      );
      gradient.addColorStop(0, from);
      gradient.addColorStop(1, to);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `800 60px ${FONT_STACK}`;
      ctx.fillText(initialsFor(entry.artist.name), x, avatarY + 20);

      // Rank chip, tucked at the avatar's top-left.
      const chipX = x - avatarRadius - 6;
      const chipY = avatarY - avatarRadius - 6;
      const [chipFrom, chipTo] = medalHues[index + 1] ?? medalHues['3'];
      const chipGradient = ctx.createLinearGradient(chipX, chipY, chipX + 56, chipY + 56);
      chipGradient.addColorStop(0, chipFrom);
      chipGradient.addColorStop(1, chipTo);
      ctx.fillStyle = chipGradient;
      this.roundRect(ctx, chipX, chipY, 56, 56, 16);
      ctx.fill();
      ctx.fillStyle = index === 0 ? '#2b1e00' : '#111827';
      ctx.font = `900 32px ${FONT_STACK}`;
      ctx.fillText(medals[index] ?? '', chipX + 28, chipY + 39);

      // Name, wrapped into the column width.
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 40px ${FONT_STACK}`;
      const columnWidth = W * 0.3;
      const nameBottom = this.drawWrapped(
        ctx,
        entry.artist.name,
        x,
        avatarY + avatarRadius + 56,
        columnWidth,
        44,
      );

      ctx.fillStyle = 'rgba(251,191,36,0.9)';
      ctx.font = `700 30px ${FONT_STACK}`;
      ctx.fillText(
        `${entry.wins} ${entry.wins === 1 ? 'crown' : 'crowns'}`,
        x,
        nameBottom + 44,
      );
    });

    // Footer stats line.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,243,255,0.55)';
    ctx.font = `600 28px ${FONT_STACK}`;
    const extras = [
      `${summary.duelsPlayed} duels played`,
      `${summary.crowned} bands crowned`,
    ];
    if (summary.favouriteGenre) {
      extras.push(`Favourite lane: ${summary.favouriteGenre.genreName}`);
    }
    ctx.fillText(extras.join('  ·  '), W / 2, H - 170);

    ctx.fillStyle = 'rgba(245,243,255,0.42)';
    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillText('No scores. No timers. Just your taste.', W / 2, H - 84);
  }

  private glow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    seed: string,
    alpha: number,
  ): void {
    const hue = hueFor(seed);
    const radial = ctx.createRadialGradient(x, y, 0, x, y, radius);
    radial.addColorStop(0, `hsla(${hue}, 80%, 55%, ${alpha})`);
    radial.addColorStop(1, `hsla(${hue}, 80%, 55%, 0)`);
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Draws centred, word-wrapped text and returns the y of the final baseline. */
  private drawWrapped(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
  ): number {
    const lines = this.wrap(ctx, text, maxWidth);
    lines.forEach((line, index) => {
      ctx.fillText(line, centerX, startY + index * lineHeight);
    });
    return startY + (lines.length - 1) * lineHeight;
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || current === '') {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [''];
  }

  private truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}
