import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { GENRES } from '../core/data/genres.data';
import { imageFor } from '../core/data/artist-images';
import type { Artist } from '../core/models/artist.model';
import { initialsFor } from './artist-art';
import { ArtistAvatarComponent } from './artist-avatar.component';

/**
 * Taken from the shipped catalogue rather than hardcoded, so these tests keep
 * covering the real data as the generator re-runs.
 */
const ALL_ARTISTS: readonly Artist[] = GENRES.flatMap((genre) => genre.artists);
const WITH_PHOTO = ALL_ARTISTS.find((artist) => imageFor(artist));
const WITHOUT_PHOTO = ALL_ARTISTS.find((artist) => !imageFor(artist));

describe('ArtistAvatarComponent', () => {
  let fixture: ComponentFixture<ArtistAvatarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ArtistAvatarComponent] }).compileComponents();
  });

  function render(artist: Artist): HTMLElement {
    fixture = TestBed.createComponent(ArtistAvatarComponent);
    fixture.componentRef.setInput('artist', artist);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the bundled Commons photo for an artist that has one', () => {
    expect(WITH_PHOTO, 'no artist in the catalogue has a photo').toBeDefined();

    const photo = imageFor(WITH_PHOTO!)!;
    const element = render(WITH_PHOTO!);
    const image = element.querySelector('img.avatar__photo');

    expect(image).not.toBeNull();
    expect(image!.getAttribute('src')).toBe(photo);
    expect(image!.getAttribute('alt')).toContain(WITH_PHOTO!.name);
    // The generated artwork must not be rendered behind a working photo.
    expect(element.querySelector('.avatar__art')).toBeNull();
  });

  it('falls back to generated artwork for an artist with no usable photo', () => {
    expect(WITHOUT_PHOTO, 'every artist in the catalogue has a photo').toBeDefined();

    const element = render(WITHOUT_PHOTO!);

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.avatar__art')).not.toBeNull();
    expect(element.textContent).toContain(initialsFor(WITHOUT_PHOTO!.name));
  });

  it('falls back to generated artwork when the photo fails to load', () => {
    const element = render(WITH_PHOTO!);

    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.avatar__art')).not.toBeNull();
  });
});
