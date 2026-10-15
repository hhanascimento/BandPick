import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PHOTO_CREDITS } from '../../core/data/artist-credits.generated';
import { CreditsPage } from './credits.page';

/** Matches PAGE_SIZE in the component: the first render is deliberately capped. */
const FIRST_PAGE = 60;

describe('CreditsPage', () => {
  let fixture: ComponentFixture<CreditsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditsPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CreditsPage);
    fixture.detectChanges();
  });

  function entries(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.credit')) as HTMLElement[];
  }

  function artists(): string[] {
    return (
      Array.from(fixture.nativeElement.querySelectorAll('.credit__artist')) as HTMLElement[]
    ).map((element) => element.textContent?.trim() ?? '');
  }

  it('has credits to show', () => {
    // Guards the rest of this file: an empty credit list would make the
    // assertions below vacuously true.
    expect(PHOTO_CREDITS.length).toBeGreaterThan(0);
  });

  it('explains where the photos come from and that they were modified', () => {
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Wikimedia Commons');
    expect(text).toContain('cropped and resized');
  });

  it('renders the first page of credits, not the whole list at once', () => {
    const expected = Math.min(PHOTO_CREDITS.length, FIRST_PAGE);
    expect(entries()).toHaveLength(expected);
    expect(artists()).toEqual(PHOTO_CREDITS.slice(0, expected).map((c) => c.artistName));
  });

  it('credits each photo with a licence and a source link', () => {
    const first = fixture.nativeElement.querySelector('.credit') as HTMLElement;
    const links = Array.from(first.querySelectorAll('a')) as HTMLAnchorElement[];

    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link.getAttribute('rel')).toContain('noopener');
    }
    // The licence name is surfaced next to the credit.
    expect(first.textContent).toContain(PHOTO_CREDITS[0].author);
  });

  it('offers "show more" only when there is more to show', () => {
    const more = fixture.nativeElement.querySelector('.more') as HTMLElement | null;
    if (PHOTO_CREDITS.length > FIRST_PAGE) {
      expect(more).not.toBeNull();
    } else {
      expect(more).toBeNull();
    }
  });

  it('reveals another page when "show more" is tapped', () => {
    const more = fixture.nativeElement.querySelector('.more') as HTMLElement | null;
    if (!more) {
      return;
    }

    const before = entries().length;
    more.click();
    fixture.detectChanges();

    expect(entries().length).toBe(Math.min(PHOTO_CREDITS.length, before + FIRST_PAGE));
  });

  it('returns to the "show more" limit when a new search starts', () => {
    const more = fixture.nativeElement.querySelector('.more') as HTMLElement | null;
    if (!more) {
      return;
    }
    more.click();
    fixture.detectChanges();

    const searchbar = fixture.nativeElement.querySelector('ion-searchbar') as HTMLElement & {
      value?: string;
    };
    searchbar.value = '';
    searchbar.dispatchEvent(
      new CustomEvent('ionInput', { detail: { value: '' }, bubbles: false }),
    );
    fixture.detectChanges();

    expect(entries().length).toBe(Math.min(PHOTO_CREDITS.length, FIRST_PAGE));
  });

  it('filters by artist or photographer', () => {
    const needle = PHOTO_CREDITS[0].artistName;
    const searchbar = fixture.nativeElement.querySelector('ion-searchbar') as HTMLElement;

    searchbar.dispatchEvent(
      new CustomEvent('ionInput', { detail: { value: needle }, bubbles: false }),
    );
    fixture.detectChanges();

    const shown = artists();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((name) => name.toLowerCase().includes(needle.toLowerCase()))).toBe(true);
  });

  it('says so when nothing matches', () => {
    const searchbar = fixture.nativeElement.querySelector('ion-searchbar') as HTMLElement;
    searchbar.dispatchEvent(
      new CustomEvent('ionInput', {
        detail: { value: 'zzzz-no-such-artist-zzzz' },
        bubbles: false,
      }),
    );
    fixture.detectChanges();

    expect(entries()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No credits match that search');
  });
});
