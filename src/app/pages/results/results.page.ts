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
  copyOutline,
  downloadOutline,
  logoFacebook,
  logoInstagram,
  logoWhatsapp,
  logoX,
  musicalNotes,
  paperPlane,
  refresh,
  shareSocial,
  textOutline,
  trophy,
} from 'ionicons/icons';
import { eliminationLabel, formatLabel, type GameResult } from '../../core/models/game.model';
import { bracketBoard, bracketJoinsByGap } from '../../shared/bracket-board';
import { GameService } from '../../core/services/game.service';
import {
  ShareService,
  type ShareDestination,
  type ShareOutcome,
} from '../../core/services/share.service';
import { ShareCardService } from '../../core/services/share-card.service';
import { SPOTIFY_EMBED_HEIGHT, SpotifyService } from '../../core/services/spotify.service';
import { ArtistAvatarComponent } from '../../shared/artist-avatar.component';

interface Destination {
  readonly id: ShareDestination;
  readonly label: string;
  readonly icon: string;
  readonly tone: string;
}

@Component({
  selector: 'app-results',
  templateUrl: 'results.page.html',
  styleUrls: ['results.page.scss'],
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
export class ResultsPage {
  private readonly router = inject(Router);
  private readonly game = inject(GameService);
  private readonly share = inject(ShareService);
  private readonly cards = inject(ShareCardService);
  private readonly spotify = inject(SpotifyService);

  protected readonly result = this.game.result;
  protected readonly toast = signal({ open: false, message: '' });

  /** '12 rounds' or '16-artist bracket', matching the share caption and card. */
  protected readonly formatSummary = computed(() => {
    const result = this.result();
    return result ? formatLabel(result) : '';
  });

  /**
   * The knockout tree for a bracket game, or null in standard play.
   *
   * Shared with the share card, so the bracket the player sees and the bracket
   * they share are built from one derivation.
   */
  protected readonly bracket = computed(() => {
    const result = this.result();
    return result ? bracketBoard(result) : null;
  });

  /**
   * Connector geometry, one group per stage boundary, so the bracket is drawn as
   * a tree rather than merely listed. Shares its formula with the share card.
   */
  protected readonly joinsByGap = computed(() => {
    const board = this.bracket();
    return board ? bracketJoinsByGap(board) : [];
  });

  /** Spotify player and link for the crowned artist. */
  protected readonly listen = computed(() => {
    const result = this.result();
    return result ? this.spotify.target(result.champion) : null;
  });

  /** Passed through to the template: the iframe needs an explicit height. */
  protected readonly embedHeight = SPOTIFY_EMBED_HEIGHT;

  /** Shared with the model so the wording cannot drift from the data. */
  protected readonly describeElimination = eliminationLabel;

  /** A live preview of the exact image that will be shared. */
  protected readonly cardPreview = computed(() => {
    const result = this.result();
    return result ? this.cards.toDataUrl(result) : null;
  });

  protected readonly destinations: readonly Destination[] = [
    { id: 'instagram', label: 'Instagram', icon: logoInstagram, tone: 'ig' },
    { id: 'facebook', label: 'Facebook', icon: logoFacebook, tone: 'fb' },
    { id: 'x', label: 'X', icon: logoX, tone: 'x' },
    { id: 'whatsapp', label: 'WhatsApp', icon: logoWhatsapp, tone: 'wa' },
    { id: 'telegram', label: 'Telegram', icon: paperPlane, tone: 'tg' },
  ];

  protected readonly icons = {
    share: shareSocial,
    text: textOutline,
    download: downloadOutline,
    copy: copyOutline,
    refresh,
    trophy,
    spotify: musicalNotes,
  };

  constructor() {
    addIcons({
      copyOutline,
      downloadOutline,
      logoFacebook,
      logoInstagram,
      logoWhatsapp,
      logoX,
      musicalNotes,
      paperPlane,
      refresh,
      shareSocial,
      textOutline,
      trophy,
    });
  }

  protected shareResult(): Promise<void> {
    return this.run((result) => this.share.shareResult(result));
  }

  protected shareTextOnly(): Promise<void> {
    return this.run((result) => this.share.shareText(result));
  }

  protected saveCard(): Promise<void> {
    return this.run((result) => this.share.saveCard(result));
  }

  protected copyText(): Promise<void> {
    return this.run((result) => this.share.copyText(result));
  }

  protected shareTo(destination: ShareDestination): Promise<void> {
    return this.run((result) => this.share.open(destination, result));
  }

  /** Opens the champion in Spotify, or says so when nothing could take the link. */
  protected async openSpotify(): Promise<void> {
    const result = this.result();
    if (!result) {
      return;
    }
    const opened = await this.spotify.open(result.champion);
    if (!opened) {
      this.toast.set({ open: true, message: 'Could not open Spotify — try again later.' });
    }
  }

  protected playAgain(): void {
    this.game.restart();
    void this.router.navigateByUrl('/battle');
  }

  protected newGame(): void {
    this.game.reset();
    void this.router.navigateByUrl('/setup');
  }

  protected closeToast(): void {
    this.toast.set({ open: false, message: '' });
  }

  private async run(action: (result: GameResult) => Promise<ShareOutcome>): Promise<void> {
    const result = this.result();
    if (!result) {
      return;
    }

    let outcome: ShareOutcome;
    try {
      outcome = await action(result);
    } catch {
      outcome = 'unavailable';
    }

    this.toast.set({ open: true, message: this.share.describeOutcome(outcome) });
  }
}
