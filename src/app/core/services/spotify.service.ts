import { Injectable, inject } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { Browser } from '@capacitor/browser';
import type { Artist } from '../models/artist.model';
import { spotifyArtistIdFor } from '../data/artist-spotify.generated';

/**
 * Everything the listen section needs for one artist.
 *
 * `embedUrl` is null when the catalogue has no Spotify id for the artist, and
 * `openUrl` always exists — it falls back to a Spotify search for the name, so
 * the section never leaves the player at a dead end.
 */
export interface SpotifyTarget {
  /** Spotify's id for the artist, when we have one. */
  readonly artistId: string | null;
  /** Player to frame on the page, or null to show the link on its own. */
  readonly embedUrl: SafeResourceUrl | null;
  /** Where the button sends the player. */
  readonly openUrl: string;
  /** Button wording: opening an artist page, or searching for one. */
  readonly actionLabel: string;
}

/**
 * How tall the framed player should be, in CSS pixels.
 *
 * The iframe's `allow` permissions are deliberately not exported from here:
 * Angular only accepts `allow` as a static attribute on the element (it refuses
 * to bind it, for security reasons), so they are written literally in
 * results.page.html.
 */
export const SPOTIFY_EMBED_HEIGHT = 352;

const EMBED_BASE = 'https://open.spotify.com/embed/artist/';
const ARTIST_BASE = 'https://open.spotify.com/artist/';
const SEARCH_BASE = 'https://open.spotify.com/search/';

/**
 * Whether a value is a Spotify artist id: 22 base-62 characters.
 *
 * Everything the service builds goes through this, so a bad Wikidata edit can
 * never reach a URL or an iframe.
 */
export function isSpotifyArtistId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{22}$/.test(value);
}

/**
 * Opens an external link.
 *
 * Its own injectable rather than a private method of the Spotify service, so the
 * Spotify tests can put a plain stand-in in its place. `Browser` from Capacitor
 * cannot be spied on: it is a lazy proxy with no `open` until a native bridge
 * exists.
 */
@Injectable({ providedIn: 'root' })
export class ExternalLinkOpener {
  /** Returns whether the link was handed to something that can open it. */
  async open(url: string): Promise<boolean> {
    try {
      await Browser.open({ url });
      return true;
    } catch {
      // No native Browser implementation: let the platform have a go.
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Links to Spotify. No API key, no OAuth and no backend: a Spotify artist id is
 * a public identifier, and `open.spotify.com/embed/artist/<id>` is a player any
 * page may frame. That keeps the app offline-first — nothing here fetches
 * anything of our own, and the equivalent Web API route would need client
 * credentials and a token before the results screen could render.
 *
 * The ids come from the build pipeline (Wikidata P1902), not from a runtime call.
 */
@Injectable({ providedIn: 'root' })
export class SpotifyService {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly opener = inject(ExternalLinkOpener);

  /** Spotify's artist id for an artist, or null when the catalogue has none. */
  artistIdFor(artist: Artist): string | null {
    const id = spotifyArtistIdFor(artist);
    return isSpotifyArtistId(id) ? id : null;
  }

  /**
   * Spotify's own web player for the artist — the same page the desktop and
   * mobile clients open, so a shared link behaves the way a Spotify user expects.
   */
  artistUrl(artist: Artist): string | null {
    const id = this.artistIdFor(artist);
    return id ? `${ARTIST_BASE}${id}` : null;
  }

  /** Spotify search for the artist by name, used when there is no id. */
  searchUrl(artist: Artist): string {
    return `${SEARCH_BASE}${encodeURIComponent(artist.name)}`;
  }

  /**
   * The player to frame, already trusted for `[src]` binding.
   *
   * The URL is built here from a validated id rather than passed in, so the
   * sanitizer bypass only ever applies to an `open.spotify.com` embed.
   */
  embedUrl(artist: Artist): SafeResourceUrl | null {
    const id = this.artistIdFor(artist);
    if (!id) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(`${EMBED_BASE}${id}`);
  }

  /** Everything the listen section shows for one artist. */
  target(artist: Artist): SpotifyTarget {
    const artistId = this.artistIdFor(artist);
    return {
      artistId,
      embedUrl: this.embedUrl(artist),
      openUrl: artistId ? `${ARTIST_BASE}${artistId}` : this.searchUrl(artist),
      actionLabel: artistId ? 'Open in Spotify' : 'Find on Spotify',
    };
  }

  /**
   * Opens the artist in Spotify — the installed app where the platform hands
   * over, the web player everywhere else. Returns whether it was opened.
   */
  open(artist: Artist): Promise<boolean> {
    return this.opener.open(this.target(artist).openUrl);
  }
}
