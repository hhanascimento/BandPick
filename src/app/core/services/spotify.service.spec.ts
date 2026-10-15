import { TestBed } from '@angular/core/testing';
import type { Artist } from '../models/artist.model';
import { ExternalLinkOpener, isSpotifyArtistId, SpotifyService } from './spotify.service';

/** A real catalogue artist, so the id comes from the generated map. */
const METALLICA: Artist = { id: 'metallica', name: 'Metallica' };

/** A name that never resolves to an id, and needs URL encoding. */
const SLASHES: Artist = { id: 'ac-dc', name: 'AC/DC' };

/** The trusted payload inside a `SafeResourceUrl`. */
function unwrap(value: unknown): unknown {
  return (value as { changingThisBreaksApplicationSecurity?: unknown })
    ?.changingThisBreaksApplicationSecurity;
}

describe('SpotifyService', () => {
  /** Stands in for Capacitor's Browser, which cannot be spied on directly. */
  const open = vi.fn<(url: string) => Promise<boolean>>();
  let spotify: SpotifyService;

  beforeEach(() => {
    open.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [{ provide: ExternalLinkOpener, useValue: { open } }],
    });
    spotify = TestBed.inject(SpotifyService);
  });

  describe('isSpotifyArtistId', () => {
    it('accepts a 22-character base-62 id', () => {
      expect(isSpotifyArtistId('2ye2Wgw4gimLv2eAKyk1NB')).toBe(true);
    });

    it('rejects the shapes a bad Wikidata edit produces', () => {
      for (const value of [
        'too-short',
        'has a space here 1234',
        '2ye2Wgw4gimLv2eAKyk1NBX', // 23 characters
        '2ye2Wgw4gimLv2eAKyk1N', // 21 characters
        '',
        null,
        undefined,
        42,
      ]) {
        expect(isSpotifyArtistId(value)).toBe(false);
      }
    });
  });

  it('resolves a catalogue artist to a Spotify id', () => {
    expect(spotify.artistIdFor(METALLICA)).toMatch(/^[A-Za-z0-9]{22}$/);
  });

  it('builds the artist page, the embed and the search link from that id', () => {
    const id = spotify.artistIdFor(METALLICA)!;
    const target = spotify.target(METALLICA);

    expect(target.artistId).toBe(id);
    expect(target.openUrl).toBe(`https://open.spotify.com/artist/${id}`);
    expect(target.actionLabel).toBe('Open in Spotify');
    expect(unwrap(target.embedUrl)).toBe(`https://open.spotify.com/embed/artist/${id}`);
  });

  it('hands the iframe a trusted value, never a raw string', () => {
    const target = spotify.target(METALLICA);

    // A plain string here would be sanitized away by Angular at binding time.
    expect(typeof target.embedUrl).not.toBe('string');
    expect(target.embedUrl).not.toBeNull();
  });

  it('falls back to a Spotify search when the catalogue has no id', () => {
    const target = spotify.target(SLASHES);

    expect(spotify.artistIdFor(SLASHES)).toBeNull();
    expect(target.embedUrl).toBeNull();
    expect(target.openUrl).toBe('https://open.spotify.com/search/AC%2FDC');
    expect(target.actionLabel).toBe('Find on Spotify');
  });

  it('encodes awkward names rather than pasting them into the URL', () => {
    expect(spotify.searchUrl({ id: 'x', name: 'Earth, Wind & Fire' })).toBe(
      'https://open.spotify.com/search/Earth%2C%20Wind%20%26%20Fire',
    );
  });

  it('knows nothing about an artist that is not in the catalogue', () => {
    const stranger: Artist = { id: 'nobody-here', name: 'Nobody Here' };

    expect(spotify.artistIdFor(stranger)).toBeNull();
    expect(spotify.artistUrl(stranger)).toBeNull();
    expect(spotify.searchUrl(stranger)).toBe('https://open.spotify.com/search/Nobody%20Here');
  });

  it('opens the artist page for an artist with a Spotify id', async () => {
    await expect(spotify.open(METALLICA)).resolves.toBe(true);

    expect(open).toHaveBeenCalledWith(
      `https://open.spotify.com/artist/${spotify.artistIdFor(METALLICA)}`,
    );
  });

  it('opens the search page for an artist with no Spotify id', async () => {
    await spotify.open(SLASHES);

    expect(open).toHaveBeenCalledWith('https://open.spotify.com/search/AC%2FDC');
  });

  it('passes on a failure to open, rather than reporting success', async () => {
    open.mockResolvedValue(false);

    await expect(spotify.open(METALLICA)).resolves.toBe(false);
  });
});

describe('ExternalLinkOpener', () => {
  let opener: ExternalLinkOpener;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    opener = TestBed.inject(ExternalLinkOpener);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the link through Capacitor when the plugin is available', async () => {
    // jsdom has Capacitor's web implementation, which opens a real popup by
    // calling window.open itself — so this asserts the link actually leaves the
    // app rather than merely returning true.
    const windowOpen = vi.spyOn(window, 'open');
    const opened = await opener.open('https://open.spotify.com/artist/2ye2Wgw4gimLv2eAKyk1NB');

    expect(opened).toBe(true);
    expect(windowOpen).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/2ye2Wgw4gimLv2eAKyk1NB',
      '_blank',
    );
  });

  it('reports failure instead of throwing when the link cannot be opened', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('popup blocked');
    });

    await expect(opener.open('https://open.spotify.com/search/Nobody')).resolves.toBe(false);
  });
});
