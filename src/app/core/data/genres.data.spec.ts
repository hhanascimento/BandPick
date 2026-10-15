import { GameService } from '../services/game.service';
import { GENRES, findGenre } from './genres.data';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('GENRES catalogue', () => {
  it('ships the main music genres', () => {
    expect(GENRES.length).toBeGreaterThanOrEqual(12);
  });

  it('has enough artists per genre for the longest possible game', () => {
    for (const genre of GENRES) {
      // N rounds need N + 1 artists.
      expect(genre.artists.length).toBeGreaterThanOrEqual(GameService.MAX_ROUNDS + 1);
    }
  });

  it('uses unique genre ids', () => {
    const ids = GENRES.map((genre) => genre.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique artist ids inside each genre', () => {
    for (const genre of GENRES) {
      const ids = genre.artists.map((artist) => artist.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('files every act under exactly one genre', () => {
    // A knockout run picks a genre and then plays that genre's acts, so an act
    // listed twice would turn up twice in the same pool of names and make the
    // two genres overlap.
    const genreOf = new Map<string, string>();
    for (const genre of GENRES) {
      for (const artist of genre.artists) {
        const previous = genreOf.get(artist.id);
        expect(
          previous,
          `${artist.name} is filed under both ${previous} and ${genre.id}`,
        ).toBeUndefined();
        genreOf.set(artist.id, genre.id);
      }
    }
  });

  it('uses unique artist names inside each genre', () => {
    for (const genre of GENRES) {
      const names = genre.artists.map((artist) => artist.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('generates clean, accent-free slugs', () => {
    for (const genre of GENRES) {
      for (const artist of genre.artists) {
        expect(artist.id).toMatch(SLUG_PATTERN);
        expect(artist.name.trim()).toBe(artist.name);
        expect(artist.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every genre a name, blurb and emoji', () => {
    for (const genre of GENRES) {
      expect(genre.name.length).toBeGreaterThan(0);
      expect(genre.blurb.length).toBeGreaterThan(0);
      expect(genre.emoji.length).toBeGreaterThan(0);
    }
  });

  it('finds every genre by id and nothing else', () => {
    for (const genre of GENRES) {
      expect(findGenre(genre.id)).toBe(genre);
    }
    expect(findGenre('does-not-exist')).toBeUndefined();
  });
});
