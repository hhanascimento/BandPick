import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonRange,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, musicalNotes, play, speedometerOutline } from 'ionicons/icons';
import { GENRES } from '../../core/data/genres.data';
import type { GameFormat } from '../../core/models/game.model';
import { GameService, InvalidGameSetupError } from '../../core/services/game.service';

interface FormatOption {
  readonly id: GameFormat;
  readonly title: string;
  readonly blurb: string;
}

@Component({
  selector: 'app-setup',
  templateUrl: 'setup.page.html',
  styleUrls: ['setup.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonRange,
    IonTitle,
    IonToolbar,
  ],
})
export class SetupPage {
  private readonly router = inject(Router);
  private readonly game = inject(GameService);

  protected readonly genres = GENRES;
  protected readonly minRounds = GameService.MIN_ROUNDS;
  protected readonly maxRounds = GameService.MAX_ROUNDS;
  protected readonly quickPicks = [5, 10, GameService.MAX_ROUNDS] as const;
  protected readonly bracketSizes = GameService.BRACKET_SIZES;
  protected readonly maxBracketSize = GameService.MAX_BRACKET_SIZE;

  protected readonly formats: readonly FormatOption[] = [
    {
      id: 'gauntlet',
      title: 'Standard',
      blurb: `Survivor streak — your pick keeps its tile for up to ${GameService.MAX_ROUNDS} rounds.`,
    },
    {
      id: 'bracket',
      title: 'Bracket',
      blurb: `Knockout — last ${GameService.MAX_BRACKET_SIZE} bands, lose once and you are out.`,
    },
  ];

  protected readonly format = signal<GameFormat>('gauntlet');
  protected readonly rounds = signal(10);
  protected readonly bracketSize = signal<number>(GameService.MAX_BRACKET_SIZE);
  protected readonly selectedGenreId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedGenre = computed(
    () => this.genres.find((genre) => genre.id === this.selectedGenreId()) ?? null,
  );

  protected readonly isBracket = computed(() => this.format() === 'bracket');

  /** N rounds means N + 1 bands take part: one champion plus one challenger per round. */
  protected readonly artistCount = computed(() => this.rounds() + 1);

  /** A bracket of S bands is decided by S - 1 duels. */
  protected readonly bracketDuels = computed(() => Math.max(0, this.bracketSize() - 1));

  /** ion-range calls this to label the drag pin. */
  protected readonly roundsPin = (value: number): string => String(value);

  /** What the sticky footer says the player is about to start. */
  protected readonly summaryLabel = computed(() =>
    this.isBracket() ? `${this.bracketSize()}-band bracket` : `${this.rounds()} rounds`,
  );

  protected readonly canStart = computed(() => this.selectedGenre() !== null);

  protected readonly icons = {
    musicalNotes,
    play,
    checkmark: checkmarkCircle,
    speed: speedometerOutline,
  };

  constructor() {
    addIcons({ checkmarkCircle, musicalNotes, play, speedometerOutline });
  }

  protected onRoundsChange(event: CustomEvent<{ value: number | { lower: number; upper: number } }>): void {
    const value = event.detail.value;
    if (typeof value === 'number') {
      this.rounds.set(Math.round(value));
    }
  }

  protected pickRounds(value: number): void {
    this.rounds.set(value);
  }

  protected pickFormat(id: GameFormat): void {
    this.format.set(id);
    this.error.set(null);
  }

  protected pickBracketSize(size: number): void {
    this.bracketSize.set(size);
    this.error.set(null);
  }

  protected selectGenre(id: string): void {
    this.selectedGenreId.set(id);
    this.error.set(null);
  }

  protected start(): void {
    const genre = this.selectedGenre();
    if (!genre) {
      return;
    }

    try {
      if (this.isBracket()) {
        this.game.startBracket(genre, this.bracketSize());
      } else {
        this.game.start(genre, this.rounds());
      }
      void this.router.navigateByUrl('/battle');
    } catch (cause) {
      this.error.set(
        cause instanceof InvalidGameSetupError
          ? cause.message
          : 'Sorry, the game could not start. Please try again.',
      );
    }
  }
}
