import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  viewChildren,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { Side } from '../../core/models/game.model';
import { GameService } from '../../core/services/game.service';
import { ArtistAvatarComponent } from '../../shared/artist-avatar.component';

/** Blocks a second tap long enough for the new tiles to register. */
const TAP_LOCK_MS = 260;
const ENTER_ANIMATION_MS = 260;

@Component({
  selector: 'app-battle',
  templateUrl: 'battle.page.html',
  styleUrls: ['battle.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArtistAvatarComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonProgressBar,
    IonTitle,
    IonToolbar,
  ],
})
export class BattlePage {
  private readonly router = inject(Router);
  private readonly game = inject(GameService);

  /** Left and right tiles, in DOM order. */
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');

  protected readonly pairing = this.game.pairing;
  protected readonly round = this.game.round;
  protected readonly totalRounds = this.game.totalRounds;
  protected readonly genre = this.game.genre;
  protected readonly progress = this.game.progress;
  protected readonly format = this.game.format;
  protected readonly stageName = this.game.stageName;
  protected readonly tieNumber = this.game.tieNumber;
  protected readonly tiesInStage = this.game.tiesInStage;

  protected readonly isFinalRound = computed(() => this.round() >= this.totalRounds());

  protected readonly remainingLabel = computed(() =>
    this.isFinalRound()
      ? 'Final round'
      : `${this.totalRounds() - this.round()} round${this.totalRounds() - this.round() === 1 ? '' : 's'} to go`,
  );

  /** Top-left label: the survivor streak counts rounds, a bracket counts ties. */
  protected readonly roundLabel = computed(() =>
    this.format() === 'bracket'
      ? `${this.stageName()} · Tie ${this.tieNumber()} of ${this.tiesInStage()}`
      : `Round ${this.round()} / ${this.totalRounds()}`,
  );

  /** Top-right label: how much is left to decide. */
  protected readonly phaseLabel = computed(() => {
    if (this.format() !== 'bracket') {
      return this.remainingLabel();
    }
    if (this.isFinalRound()) {
      return 'The crown is on the line';
    }
    const left = this.tiesInStage() - this.tieNumber();
    return `${left} more tie${left === 1 ? '' : 's'} this round`;
  });

  /** Footnote under the board, describing what a win actually earns. */
  protected readonly footnote = computed(() =>
    this.format() === 'bracket'
      ? 'Win and you go through — lose once and you are out.'
      : 'Your pick stays on stage and a new challenger steps up.',
  );

  private locked = false;
  private unlockTimer: ReturnType<typeof setTimeout> | null = null;

  /** Ids of the artists currently on screen, used to spot the newcomer. */
  private shownLeft: string | null = null;
  private shownRight: string | null = null;

  constructor() {
    // Animate only the tile that received a new challenger, so the artist the
    // player just chose visibly stays put.
    effect(() => {
      const pairing = this.pairing();
      if (!pairing) {
        this.shownLeft = null;
        this.shownRight = null;
        return;
      }

      const elements = this.tiles();
      if (elements.length < 2) {
        return;
      }

      if (this.shownLeft !== null && pairing.left.id !== this.shownLeft) {
        this.animateIn(elements[0].nativeElement);
      }
      if (this.shownRight !== null && pairing.right.id !== this.shownRight) {
        this.animateIn(elements[1].nativeElement);
      }

      this.shownLeft = pairing.left.id;
      this.shownRight = pairing.right.id;
    });
  }

  protected choose(side: Side): void {
    if (this.locked || this.game.status() !== 'playing') {
      return;
    }
    this.locked = true;

    void this.tapFeedback();
    this.game.choose(side);

    if (this.game.status() === 'finished') {
      // replaceUrl so the Android back button cannot drop into a finished duel.
      // `gameFinishedGuard` normally allows this through; the catch only stops a
      // rejected navigation from surfacing as an unhandled promise rejection.
      void this.router
        .navigateByUrl('/results', { replaceUrl: true })
        .catch(() => undefined);
      return;
    }

    this.unlockTimer = setTimeout(() => {
      this.locked = false;
      this.unlockTimer = null;
    }, TAP_LOCK_MS);
  }

  ionViewWillLeave(): void {
    if (this.unlockTimer !== null) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
    this.locked = false;
  }

  private animateIn(element: HTMLElement): void {
    if (typeof element.animate !== 'function' || this.prefersReducedMotion()) {
      return;
    }
    element.animate(
      [
        { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ENTER_ANIMATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  private async tapFeedback(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics are a nicety; never let a device without a vibrator break the game.
    }
  }
}
