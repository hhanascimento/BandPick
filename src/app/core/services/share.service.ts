import { Injectable, inject } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { environment } from '../../../environments/environment';
import { formatPhrase, type GameResult } from '../models/game.model';
import type { StatsSummary } from '../models/stats.model';
import { ShareCardService } from './share-card.service';

/** Where the player wants to send the result. */
export type ShareDestination = 'instagram' | 'facebook' | 'x' | 'whatsapp' | 'telegram';

/** Result of a share attempt, so the UI can give accurate feedback. */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'downloaded' | 'unavailable';

const CARD_FILE_NAME = 'bandpick-champion.png';
const STATS_CARD_FILE_NAME = 'bandpick-stats.png';
const HASHTAGS = '#BandPick #MusicGame';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly cards = inject(ShareCardService);

  private get link(): string {
    return environment.playStoreUrl.trim();
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  /** The caption used for every destination. */
  buildText(result: GameResult): string {
    const { champion, genre, eliminations } = result;
    const lines: string[] = [
      `🏆 ${champion.name} is my champion!`,
      '',
      `I played ${formatPhrase(result)} on ${environment.appName} and crowned ${champion.name}, beating:`,
    ];

    for (const elimination of eliminations) {
      lines.push(`• ${elimination.artist.name}`);
    }

    lines.push('', 'Who would you pick? 🎧', '', HASHTAGS);

    if (this.link) {
      lines.push('', `Play it: ${this.link}`);
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /** The caption used when sharing lifetime stats. */
  buildStatsText(summary: StatsSummary): string {
    const lines: string[] = [
      `📊 My ${environment.appName} stats`,
      '',
      `🎮 ${summary.gamesPlayed} games played — ${summary.standardGames} standard, ${summary.bracketGames} bracket`,
      `⚔️ ${summary.duelsPlayed} duels, ${summary.crowned} bands crowned`,
    ];

    if (summary.favouriteGenre) {
      lines.push(`🎵 Favourite lane: ${summary.favouriteGenre.genreName}`);
    }

    if (summary.podium.length > 0) {
      lines.push('', 'Most crowned:');
      const medals = ['🥇', '🥈', '🥉'];
      summary.podium.forEach((entry, index) => {
        lines.push(
          `${medals[index] ?? '🏅'} ${entry.artist.name} — ${entry.wins} ${entry.wins === 1 ? 'crown' : 'crowns'}`,
        );
      });
    }

    lines.push('', 'Who would you pick? 🎧', '', HASHTAGS);

    if (this.link) {
      lines.push('', `Play it: ${this.link}`);
    }

    return lines.join('\n');
  }

  /** Shares the stats card image together with the caption. */
  async shareStats(summary: StatsSummary): Promise<ShareOutcome> {
    const text = this.buildStatsText(summary);

    if (Capacitor.isNativePlatform()) {
      const uri = await this.writeStatsCardToCache(summary);
      return this.nativeShare(text, uri ? [uri] : [], 'Share your stats');
    }

    const blob = await this.cards.toStatsBlob(summary);
    return this.webShare(text, blob, STATS_CARD_FILE_NAME);
  }

  /** Shares the stats caption alone — best for chat apps and posts without an image. */
  async shareStatsText(summary: StatsSummary): Promise<ShareOutcome> {
    const text = this.buildStatsText(summary);
    if (Capacitor.isNativePlatform()) {
      return this.nativeShare(text, []);
    }
    return this.webShare(text, null);
  }

  /** Saves the stats card image, for the user to post manually. */
  async saveStatsCard(summary: StatsSummary): Promise<ShareOutcome> {
    const blob = await this.cards.toStatsBlob(summary);
    if (!blob) {
      return 'unavailable';
    }

    if (!Capacitor.isNativePlatform()) {
      this.downloadBlob(blob, STATS_CARD_FILE_NAME);
      return 'downloaded';
    }

    const uri = await this.writeStatsCardToCache(summary);
    if (!uri) {
      return 'unavailable';
    }

    const canShare = await this.safeCanShare();
    if (canShare) {
      try {
        await Share.share({
          title: environment.appName,
          text: this.buildStatsText(summary),
          files: [uri],
        });
        return 'shared';
      } catch (cause) {
        return this.outcomeFor(cause);
      }
    }
    return this.copyToClipboard(this.buildStatsText(summary));
  }

  async copyStatsText(summary: StatsSummary): Promise<ShareOutcome> {
    return this.copyToClipboard(this.buildStatsText(summary));
  }

  /** Opens a specific network with the stats card and caption. */
  async openStats(destination: ShareDestination, summary: StatsSummary): Promise<ShareOutcome> {
    const text = this.buildStatsText(summary);
    const top = summary.podium[0];
    const shortText = [
      `📊 I've played ${summary.gamesPlayed} games on ${environment.appName}.`,
      top ? `Most crowned: ${top.artist.name} (${top.wins}).` : '',
      'Who would you pick? 🎧',
    ]
      .filter(Boolean)
      .join(' ');

    switch (destination) {
      case 'instagram':
        return this.shareStats(summary);

      case 'facebook':
        return this.link
          ? this.openUrl(
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.link)}&quote=${encodeURIComponent(shortText)}`,
            )
          : this.shareStats(summary);

      case 'x': {
        const url = new URL('https://twitter.com/intent/tweet');
        url.searchParams.set('text', shortText);
        if (this.link) {
          url.searchParams.set('url', this.link);
        }
        return this.openUrl(url.toString());
      }

      case 'whatsapp': {
        const payload = this.link ? `${text}\n\n${this.link}` : text;
        return this.openUrl(`https://wa.me/?text=${encodeURIComponent(payload)}`);
      }

      case 'telegram': {
        if (!this.link) {
          return this.shareStatsText(summary);
        }
        const url = new URL('https://t.me/share/url');
        url.searchParams.set('url', this.link);
        url.searchParams.set('text', shortText);
        return this.openUrl(url.toString());
      }

      default:
        return 'unavailable';
    }
  }

  // -------------------------------------------------------------------------
  // Sharing
  // -------------------------------------------------------------------------

  /** Shares the champion card image together with the caption. */
  async shareResult(result: GameResult): Promise<ShareOutcome> {
    const text = this.buildText(result);

    if (Capacitor.isNativePlatform()) {
      const uri = await this.writeCardToCache(result);
      return this.nativeShare(text, uri ? [uri] : []);
    }

    const blob = await this.cards.toBlob(result);
    return this.webShare(text, blob);
  }

  /** Shares the caption alone — best for chat apps and posts without an image. */
  async shareText(result: GameResult): Promise<ShareOutcome> {
    const text = this.buildText(result);
    if (Capacitor.isNativePlatform()) {
      return this.nativeShare(text, []);
    }
    return this.webShare(text, null);
  }

  /** Saves the card image, for the user to post manually. */
  async saveCard(result: GameResult): Promise<ShareOutcome> {
    const blob = await this.cards.toBlob(result);
    if (!blob) {
      return 'unavailable';
    }

    if (!Capacitor.isNativePlatform()) {
      this.downloadBlob(blob);
      return 'downloaded';
    }

    const uri = await this.writeCardToCache(result);
    if (!uri) {
      return 'unavailable';
    }

    const canShare = await this.safeCanShare();
    if (canShare) {
      try {
        await Share.share({ title: environment.appName, text: this.buildText(result), files: [uri] });
        return 'shared';
      } catch (cause) {
        return this.outcomeFor(cause);
      }
    }
    return this.copyToClipboard(this.buildText(result));
  }

  async copyText(result: GameResult): Promise<ShareOutcome> {
    return this.copyToClipboard(this.buildText(result));
  }

  /** Toast copy for a share attempt, shared by the results and stats screens. */
  describeOutcome(outcome: ShareOutcome, subject: 'champion' | 'stats' = 'champion'): string {
    switch (outcome) {
      case 'shared':
        return subject === 'stats'
          ? 'Your stats are on their way 🎉'
          : 'Your champion is on its way 🎉';
      case 'copied':
        return 'Caption copied to the clipboard.';
      case 'downloaded':
        return subject === 'stats' ? 'Stats card saved.' : 'Card image saved.';
      case 'dismissed':
        return 'Sharing cancelled.';
      default:
        return 'Sharing is not available right now — try “Copy” instead.';
    }
  }

  /**
   * Opens a specific network.
   *
   * Instagram has no web endpoint for pre-filled text, so the only reliable route
   * is the OS share sheet with the card image — which is exactly what the user
   * would expect anyway. Facebook and Telegram need a link to deep-link into their
   * composers; until `environment.playStoreUrl` is set they fall back to the share
   * sheet (which lists both apps on any Android device).
   */
  async open(destination: ShareDestination, result: GameResult): Promise<ShareOutcome> {
    const text = this.buildText(result);
    const shortText = this.buildShortText(result);

    switch (destination) {
      case 'instagram':
        return this.shareResult(result);

      case 'facebook':
        return this.link
          ? this.openUrl(
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.link)}&quote=${encodeURIComponent(shortText)}`,
            )
          : this.shareResult(result);

      case 'x': {
        const url = new URL('https://twitter.com/intent/tweet');
        url.searchParams.set('text', shortText);
        if (this.link) {
          url.searchParams.set('url', this.link);
        }
        return this.openUrl(url.toString());
      }

      case 'whatsapp': {
        const payload = this.link ? `${text}\n\n${this.link}` : text;
        return this.openUrl(`https://wa.me/?text=${encodeURIComponent(payload)}`);
      }

      case 'telegram': {
        if (!this.link) {
          return this.shareText(result);
        }
        const url = new URL('https://t.me/share/url');
        url.searchParams.set('url', this.link);
        url.searchParams.set('text', shortText);
        return this.openUrl(url.toString());
      }

      default:
        return 'unavailable';
    }
  }

  /** Shorter caption for networks with tight character limits. */
  private buildShortText(result: GameResult): string {
    const won =
      result.format === 'bracket' && result.bracket
        ? `It won my ${result.bracket.size}-band bracket`
        : `It outlasted ${result.totalRounds} rounds of ${result.genre.name}`;

    return [
      `🏆 My ${result.genre.name} champion is ${result.champion.name}!`,
      `${won} on ${environment.appName}.`,
      'Who would you pick? 🎧',
    ].join(' ');
  }

  // -------------------------------------------------------------------------
  // Platform plumbing
  // -------------------------------------------------------------------------

  private async nativeShare(
    text: string,
    files: string[],
    dialogTitle = 'Share your champion',
  ): Promise<ShareOutcome> {
    const canShare = await this.safeCanShare();
    if (!canShare) {
      return this.copyToClipboard(text);
    }

    try {
      await Share.share({
        title: environment.appName,
        text,
        dialogTitle,
        ...(files.length > 0 ? { files } : {}),
      });
      return 'shared';
    } catch (cause) {
      return this.outcomeFor(cause);
    }
  }

  /**
   * `Share.canShare()` takes no arguments — whether a *file* payload is accepted
   * is decided by the receiving app, so we only ask whether sharing works at all
   * and let the attempt itself report failure.
   */
  private async safeCanShare(): Promise<boolean> {
    try {
      const { value } = await Share.canShare();
      return value;
    } catch {
      // No native implementation available: let the share attempt decide.
      return true;
    }
  }

  private async webShare(
    text: string,
    blob: Blob | null,
    fileName = CARD_FILE_NAME,
  ): Promise<ShareOutcome> {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const files = blob ? [new File([blob], fileName, { type: 'image/png' })] : [];

    if (typeof nav.share !== 'function') {
      if (blob) {
        this.downloadBlob(blob);
        return 'downloaded';
      }
      return this.copyToClipboard(text);
    }

    const data: ShareData = { title: environment.appName, text };
    if (files.length > 0 && nav.canShare?.({ files })) {
      data.files = files;
    }

    try {
      await nav.share(data);
      return 'shared';
    } catch (cause) {
      if (this.isCancellation(cause)) {
        return 'dismissed';
      }
      if (blob) {
        this.downloadBlob(blob);
        return 'downloaded';
      }
      return this.copyToClipboard(text);
    }
  }

  private async openUrl(url: string): Promise<ShareOutcome> {
    try {
      await Browser.open({ url });
      return 'shared';
    } catch {
      // Last resort: hand it to the platform.
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return 'shared';
      } catch {
        return 'unavailable';
      }
    }
  }

  private async writeCardToCache(result: GameResult): Promise<string | null> {
    return this.writeBase64ToCache(CARD_FILE_NAME, await this.cards.toBase64(result));
  }

  private async writeStatsCardToCache(summary: StatsSummary): Promise<string | null> {
    return this.writeBase64ToCache(
      STATS_CARD_FILE_NAME,
      await this.cards.toStatsBase64(summary),
    );
  }

  private async writeBase64ToCache(fileName: string, base64: string | null): Promise<string | null> {
    if (!base64) {
      return null;
    }
    try {
      const written = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });
      return written.uri;
    } catch {
      return null;
    }
  }

  private async copyToClipboard(text: string): Promise<ShareOutcome> {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Clipboard API needs a secure context; fall back to the legacy path.
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok ? 'copied' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    }
  }

  private downloadBlob(blob: Blob, fileName = CARD_FILE_NAME): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private outcomeFor(cause: unknown): ShareOutcome {
    return this.isCancellation(cause) ? 'dismissed' : 'unavailable';
  }

  private isCancellation(cause: unknown): boolean {
    if (!cause) {
      return false;
    }
    const name = (cause as { name?: string }).name ?? '';
    const message = String((cause as { message?: string }).message ?? cause).toLowerCase();
    return (
      name === 'AbortError' ||
      message.includes('cancel') ||
      message.includes('dismiss') ||
      message.includes('aborted')
    );
  }
}
