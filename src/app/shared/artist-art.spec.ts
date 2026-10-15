import { gradientFor, gradientStopsFor, hueFor, initialsFor } from './artist-art';

describe('artist-art', () => {
  describe('hueFor', () => {
    it('is deterministic and stays inside the hue range', () => {
      const names = ['Queen', 'Beyoncé', 'AC/DC', '(G)I-DLE', 'Motörhead', 'Fred again..'];

      for (const name of names) {
        const hue = hueFor(name);
        expect(hue).toBe(hueFor(name));
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
      }
    });

    it('spreads different names across different hues', () => {
      const hues = new Set(
        ['Queen', 'Nirvana', 'Drake', 'SZA', 'Tool', 'Koffee'].map((name) => hueFor(name)),
      );
      expect(hues.size).toBeGreaterThan(1);
    });
  });

  describe('gradientFor', () => {
    it('produces a css gradient plus separate canvas stops', () => {
      const gradient = gradientFor('Daft Punk');
      expect(gradient).toContain('linear-gradient');
      expect(gradient).toContain('hsl(');

      const stops = gradientStopsFor('Daft Punk');
      expect(stops).toHaveLength(2);
      expect(stops[0]).toContain('hsl(');
      expect(stops[1]).toContain('hsl(');
    });

    it('is stable for the same name', () => {
      expect(gradientFor('Radiohead')).toBe(gradientFor('Radiohead'));
      expect(gradientFor('Radiohead')).not.toBe(gradientFor('Pixies'));
    });
  });

  describe('initialsFor', () => {
    it('shows very short names in full', () => {
      expect(initialsFor('BTS')).toBe('BTS');
      expect(initialsFor('U2')).toBe('U2');
      expect(initialsFor('EXO')).toBe('EXO');
      expect(initialsFor('IVE')).toBe('IVE');
      expect(initialsFor('MGMT')).toBe('MGMT');
    });

    it('uses the first two significant words otherwise', () => {
      expect(initialsFor('Taylor Swift')).toBe('TS');
      expect(initialsFor('Daft Punk')).toBe('DP');
      expect(initialsFor('50 Cent')).toBe('5C');
      expect(initialsFor('Bob Marley & The Wailers')).toBe('BM');
    });

    it('skips leading articles', () => {
      expect(initialsFor('The Beatles')).toBe('BE');
      expect(initialsFor('The Rolling Stones')).toBe('RS');
    });

    it('falls back to the first two letters of a single-word name', () => {
      expect(initialsFor('Beyoncé')).toBe('BE');
      expect(initialsFor('Radiohead')).toBe('RA');
    });

    it('always returns something non-empty', () => {
      const names = [
        'AC/DC',
        '(G)I-DLE',
        'Fred again..',
        "D'Angelo",
        'Motörhead',
        'TOMORROW X TOGETHER',
        '  ',
      ];
      for (const name of names) {
        expect(initialsFor(name).length).toBeGreaterThan(0);
      }
    });
  });
});
