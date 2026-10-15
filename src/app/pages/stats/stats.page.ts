import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  copyOutline,
  downloadOutline,
  flame,
  gameController,
  gitNetworkOutline,
  logoFacebook,
  logoInstagram,
  logoWhatsapp,
  logoX,
  musicalNotes,
  paperPlane,
  play,
  shareSocial,
  textOutline,
  trophy,
} from 'ionicons/icons';
import type { StatsSummary } from '../../core/models/stats.model';
import { GameService } from '../../core/services/game.service';
import { StatsService } from '../../core/services/stats.service';
import {
  ShareService,
  type ShareDestination,
  type ShareOutcome,
} from '../../core/services/share.service';
import { ShareCardService } from '../../core/services/share-card.service';
import { ArtistAvatarComponent } from '../../shared/artist-avatar.component';

interface Destination {
  readonly id: ShareDestination;
  readonly label: string;
  readonly icon: string;
  readonly tone: string;
}

@Component({
  selector: 'app-stats',
  templateUrl: 'stats.page.html',
  styleUrls: ['stats.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArtistAvatarComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToast,
    IonToolbar,
  ],
})
export class StatsPage {
  private readonly router = inject(Router);
  private readonly game = inject(GameService);
  private readonly stats = inject(StatsService);
  private readonly share = inject(ShareService);
  private readonly cards = inject(ShareCardService);

  protected readonly summary = this.stats.summary;
  protected readonly toast = signal({ open: false, message: '' });

  protected readonly hasGames = computed(() => this.summary().gamesPlayed > 0);

  /** Standard vs bracket, as percentages that always add up to 100. */
  protected readonly split = computed(() => {
    const { gamesPlayed, standardGames } = this.summary();
    if (gamesPlayed === 0) {
      return { standard: 0, bracket: 0 };
    }
    const standard = Math.round((standardGames / gamesPlayed) * 100);
    return { standard, bracket: 100 - standard };
  });

  /** Spoken form of the split bar, for screen readers. */
  protected readonly splitLabel = computed(
    () => `Standard ${this.split().standard}%, bracket ${this.split().bracket}%`,
  );

  /** '12 Oct 2025' for the first game on record. */
  protected readonly sinceLabel = computed(() => {
    const first = this.summary().firstPlayedAt;
    if (first === null) {
      return null;
    }
    return new Date(first).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  });

  /** A live preview of the exact image that will be shared. */
  protected readonly cardPreview = computed(() => {
    const summary = this.summary();
    return this.hasGames() ? this.cards.toStatsDataUrl(summary) : null;
  });

  protected readonly medals = ['🥇', '🥈', '🥉'] as const;

  protected readonly destinations: readonly Destination[] = [
    { id: 'instagram', label: 'Instagram', icon: logoInstagram, tone: 'ig' },
    { id: 'facebook', label: 'Facebook', icon: logoFacebook, tone: 'fb' },
    { id: 'x', label: 'X', icon: logoX, tone: 'x' },
    { id: 'whatsapp', label: 'WhatsApp', icon: logoWhatsapp, tone: 'wa' },
    { id: 'telegram', label: 'Telegram', icon: paperPlane, tone: 'tg' },
  ];

  protected readonly icons = {
    play,
    share: shareSocial,
    text: textOutline,
    download: downloadOutline,
    copy: copyOutline,
    duels: gameController,
    crown: trophy,
    streak: flame,
    bracket: gitNetworkOutline,
    genre: musicalNotes,
    since: calendarOutline,
  };

  constructor() {
    addIcons({
      calendarOutline,
      copyOutline,
      downloadOutline,
      flame,
      gameController,
      gitNetworkOutline,
      logoFacebook,
      logoInstagram,
      logoWhatsapp,
      logoX,
      musicalNotes,
      paperPlane,
      play,
      shareSocial,
      textOutline,
      trophy,
    });
  }

  /** Clears any game in progress, the same way the home screen's Play does. */
  protected playNow(): void {
    this.game.reset();
    void this.router.navigateByUrl('/setup');
  }

  protected shareStats(): Promise<void> {
    return this.run((summary) => this.share.shareStats(summary));
  }

  protected shareTextOnly(): Promise<void> {
    return this.run((summary) => this.share.shareStatsText(summary));
  }

  protected saveCard(): Promise<void> {
    return this.run((summary) => this.share.saveStatsCard(summary));
  }

  protected copyText(): Promise<void> {
    return this.run((summary) => this.share.copyStatsText(summary));
  }

  protected shareTo(destination: ShareDestination): Promise<void> {
    return this.run((summary) => this.share.openStats(destination, summary));
  }

  protected closeToast(): void {
    this.toast.set({ open: false, message: '' });
  }

  private async run(action: (summary: StatsSummary) => Promise<ShareOutcome>): Promise<void> {
    let outcome: ShareOutcome;
    try {
      outcome = await action(this.summary());
    } catch {
      outcome = 'unavailable';
    }

    this.toast.set({ open: true, message: this.share.describeOutcome(outcome, 'stats') });
  }
}
