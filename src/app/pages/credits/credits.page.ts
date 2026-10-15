import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, openOutline } from 'ionicons/icons';
import { PHOTO_CREDITS } from '../../core/data/artist-credits.generated';
import { bundledPhotoCount } from '../../core/data/artist-images';

/** Entries rendered per "show more" step, to keep the list light on mobile. */
const PAGE_SIZE = 60;

/**
 * Photo attribution.
 *
 * Every bundled photo is a Wikimedia Commons file, and the Creative Commons
 * licences they are used under require credit, a licence reference and an
 * indication of changes. Those obligations are met here — see
 * `docs/PHOTO_CREDITS.md`.
 */
@Component({
  selector: 'app-credits',
  templateUrl: 'credits.page.html',
  styleUrls: ['credits.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
})
export class CreditsPage {
  protected readonly credits = PHOTO_CREDITS;
  protected readonly photoCount = bundledPhotoCount();

  protected readonly icons = { camera: cameraOutline, external: openOutline };

  private readonly query = signal('');
  private readonly visibleCount = signal(PAGE_SIZE);

  protected readonly filtered = computed(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) {
      return this.credits;
    }
    return this.credits.filter(
      (credit) =>
        credit.artistName.toLowerCase().includes(needle) ||
        credit.author.toLowerCase().includes(needle),
    );
  });

  protected readonly visible = computed(() => this.filtered().slice(0, this.visibleCount()));

  protected readonly remaining = computed(() =>
    Math.max(0, this.filtered().length - this.visible().length),
  );

  constructor() {
    addIcons({ cameraOutline, openOutline });
  }

  protected onSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.query.set(event.detail.value ?? '');
    // A new search starts a fresh window.
    this.visibleCount.set(PAGE_SIZE);
  }

  protected showMore(): void {
    this.visibleCount.update((count) => count + PAGE_SIZE);
  }
}
