import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  handLeftOutline,
  listOutline,
  shuffleOutline,
  timerOutline,
  trophyOutline,
} from 'ionicons/icons';
import { GENRES } from '../../core/data/genres.data';
import { GameService } from '../../core/services/game.service';

interface Step {
  readonly title: string;
  readonly text: string;
}

interface FormatSummary {
  readonly title: string;
  readonly text: string;
}

@Component({
  selector: 'app-instructions',
  templateUrl: 'instructions.page.html',
  styleUrls: ['instructions.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, RouterLink],
})
export class InstructionsPage {
  protected readonly genres = GENRES;
  protected readonly maxRounds = GameService.MAX_ROUNDS;
  protected readonly minRounds = GameService.MIN_ROUNDS;
  protected readonly maxBracketSize = GameService.MAX_BRACKET_SIZE;

  protected readonly steps: readonly Step[] = [
    {
      title: 'Pick a music style',
      text: `${GENRES.length} genres are on the menu, from Pop to K-Pop. Choose the one you want to duel in.`,
    },
    {
      title: 'Choose a format and a length',
      text: `Standard runs for ${GameService.MIN_ROUNDS}–${GameService.MAX_ROUNDS} rounds; a bracket runs until one band is left standing.`,
    },
    {
      title: 'Tap the band you prefer',
      text: 'Two bands take the stage. Tap your favourite — there is no right answer.',
    },
    {
      title: 'Follow your champion',
      text: 'In a standard game your pick keeps its place and a new challenger steps up. In a bracket every winner advances a round. Either way the last band standing is crowned, with everyone it beat listed beside it.',
    },
  ];

  protected readonly formats: readonly FormatSummary[] = [
    {
      title: `Standard · up to ${GameService.MAX_ROUNDS} rounds`,
      text: 'A survivor streak. Two bands take the stage, you tap one, and your pick stays on its tile while a new challenger steps up. Play as few as one round or as many as twenty.',
    },
    {
      title: `Bracket · last ${GameService.MAX_BRACKET_SIZE}`,
      text: `A knockout tournament of ${GameService.BRACKET_SIZES.join(' or ')} bands. Everyone is paired off, each winner advances, and every loser is out for good — until the final crowns a champion. A ${GameService.MAX_BRACKET_SIZE}-band bracket takes ${GameService.MAX_BRACKET_SIZE - 1} duels.`,
    },
  ];

  protected readonly rules: readonly string[] = [
    'No scoring and no timers — you are just following your taste.',
    'The same band never shows up twice in one game.',
    'Every run is shuffled, so no two games are alike.',
    'Your favourite is always the winner. There are no wrong answers.',
    'In a bracket, losing once is the end of the road — there is no second chance.',
  ];

  protected readonly ruleIcons = [
    timerOutline,
    listOutline,
    shuffleOutline,
    handLeftOutline,
    trophyOutline,
  ];

  constructor() {
    addIcons({ handLeftOutline, listOutline, shuffleOutline, timerOutline, trophyOutline });
  }
}
