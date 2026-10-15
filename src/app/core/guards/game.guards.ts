import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { GameService } from '../services/game.service';

/**
 * Only reachable while a game is actually being played. Handles a page reload or
 * a deep link straight to /battle.
 */
export const gameInProgressGuard: CanActivateFn = () => {
  const game = inject(GameService);
  const router = inject(Router);
  return game.status() === 'playing' ? true : router.createUrlTree(['/home']);
};

/** Only reachable once a game has a champion. */
export const gameFinishedGuard: CanActivateFn = () => {
  const game = inject(GameService);
  const router = inject(Router);
  return game.status() === 'finished' ? true : router.createUrlTree(['/home']);
};
