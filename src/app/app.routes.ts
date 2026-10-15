import { Routes } from '@angular/router';
import { gameFinishedGuard, gameInProgressGuard } from './core/guards/game.guards';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'instructions',
    loadComponent: () =>
      import('./pages/instructions/instructions.page').then((m) => m.InstructionsPage),
  },
  {
    // Lifetime stats, derived from the local log — always reachable.
    path: 'stats',
    loadComponent: () => import('./pages/stats/stats.page').then((m) => m.StatsPage),
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.page').then((m) => m.SetupPage),
  },
  {
    // Attribution for the bundled Commons photos — required by their licences.
    path: 'credits',
    loadComponent: () => import('./pages/credits/credits.page').then((m) => m.CreditsPage),
  },
  {
    // Only reachable while a game is in progress, so a reload lands on Home
    // instead of an empty board.
    path: 'battle',
    canActivate: [gameInProgressGuard],
    loadComponent: () => import('./pages/battle/battle.page').then((m) => m.BattlePage),
  },
  {
    path: 'results',
    canActivate: [gameFinishedGuard],
    loadComponent: () => import('./pages/results/results.page').then((m) => m.ResultsPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
