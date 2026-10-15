/**
 * Deterministic artwork helpers.
 *
 * Every artist gets a stable colour derived from their name, so a tile always
 * looks the same across rounds and sessions, and the board stays varied without
 * anyone hand-picking colours.
 */

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Base hue (0–359) for an artist name. */
export function hueFor(name: string): number {
  return hash(name) % 360;
}

/** Two-stop gradient used behind the artist initials. */
export function gradientFor(name: string): string {
  const base = hueFor(name);
  const accent = (base + 42) % 360;
  // Comma-separated hsl() keeps the value valid for both CSS and canvas.
  return `linear-gradient(150deg, hsl(${base}, 72%, 48%) 0%, hsl(${accent}, 68%, 30%) 100%)`;
}

/** The same two stops as separate colours, for canvas gradients. */
export function gradientStopsFor(name: string): [string, string] {
  const base = hueFor(name);
  const accent = (base + 42) % 360;
  return [`hsl(${base}, 72%, 48%)`, `hsl(${accent}, 68%, 30%)`];
}

const IGNORED = new Set(['the', 'a', 'an', 'of', 'and']);

/**
 * Short label shown on generated artwork.
 * Very short names are shown whole (`BTS`, `U2`, `EXO`), otherwise two initials.
 */
export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return '?';
  }
  if (trimmed.length <= 4) {
    return trimmed.toUpperCase();
  }

  const words = trimmed
    .replace(/[^\p{L}\p{N}\s.']/gu, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0 && !IGNORED.has(word.toLowerCase()));

  if (words.length === 0) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
