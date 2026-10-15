import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  gitNetworkOutline,
  informationCircleOutline,
  play,
  sparkles,
  statsChart,
  trophyOutline,
} from 'ionicons/icons';
import { GameService } from '../../core/services/game.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonIcon],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly game = inject(GameService);

  protected readonly playIcon = play;
  protected readonly infoIcon = informationCircleOutline;
  protected readonly statsIcon = statsChart;
  protected readonly sparkleIcon = sparkles;
  protected readonly trophyIcon = trophyOutline;
  protected readonly bracketIcon = gitNetworkOutline;
  protected readonly maxRounds = GameService.MAX_ROUNDS;
  protected readonly maxBracketSize = GameService.MAX_BRACKET_SIZE;

  constructor() {
    addIcons({
      play,
      informationCircleOutline,
      sparkles,
      statsChart,
      trophyOutline,
      gitNetworkOutline,
    });
  }

  protected play(): void {
    // Any previous game is discarded so a fresh run always starts at the setup screen.
    this.game.reset();
    void this.router.navigateByUrl('/setup');
  }

  protected openStats(): void {
    void this.router.navigateByUrl('/stats');
  }

  protected openInstructions(): void {
    void this.router.navigateByUrl('/instructions');
  }
}
