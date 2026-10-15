import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { Artist } from '../core/models/artist.model';
import { imageFor } from '../core/data/artist-images';
import { gradientFor, initialsFor } from './artist-art';

/**
 * Shows an artist's photo when one is configured and loads successfully, and
 * generated artwork built from the name otherwise — so a missing or broken image
 * never leaves a hole in the layout.
 *
 * The corner radius can be tuned by the parent through `--avatar-radius`.
 */
@Component({
  selector: 'app-artist-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showImage()) {
      <img
        class="avatar__photo"
        [src]="source()!"
        [alt]="'Photo of ' + artist().name"
        loading="lazy"
        decoding="async"
        (error)="onImageError()"
      />
    } @else {
      <div class="avatar__art" [style.background]="gradient()" aria-hidden="true">
        <span class="avatar__initials">{{ initials() }}</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        border-radius: var(--avatar-radius, 16px);
        overflow: hidden;
        background: rgba(255, 255, 255, 0.06);
      }

      .avatar__photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .avatar__art {
        position: relative;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        container-type: inline-size;
      }

      /* Soft top-left highlight so the flat gradient reads as artwork, not a placeholder. */
      .avatar__art::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          120% 90% at 20% 0%,
          rgba(255, 255, 255, 0.28) 0%,
          rgba(255, 255, 255, 0) 55%
        );
        pointer-events: none;
      }

      .avatar__initials {
        font-size: clamp(1.5rem, 34cqw, 4rem);
        font-weight: 800;
        letter-spacing: 0.02em;
        color: rgba(255, 255, 255, 0.94);
        text-shadow: 0 2px 14px rgba(0, 0, 0, 0.35);
        line-height: 1;
      }
    `,
  ],
})
export class ArtistAvatarComponent {
  readonly artist = input.required<Artist>();

  /** Set when the configured photo fails to load, so we fall back to generated art. */
  private readonly failed = signal(false);

  protected readonly source = computed(() => imageFor(this.artist()));
  protected readonly showImage = computed(() => Boolean(this.source()) && !this.failed());
  protected readonly initials = computed(() => initialsFor(this.artist().name));
  protected readonly gradient = computed(() => gradientFor(this.artist().name));

  protected onImageError(): void {
    this.failed.set(true);
  }
}
