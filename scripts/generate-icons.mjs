/**
 * Regenerates the app icon and splash sources in `assets/`.
 *
 * The mark is drawn as vector paths rather than SVG text so the output does not
 * depend on any system font being installed. Run it with:
 *
 *   node scripts/generate-icons.mjs
 *   npx capacitor-assets generate --android
 *
 * The generated `assets/*.png` files are the sources @capacitor/assets turns into
 * the Android mipmaps and splash resources.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GRADIENT = `
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b5cf6"/>
    <stop offset="1" stop-color="#ec4899"/>
  </linearGradient>`;

/**
 * The "or" mark: a geometric lowercase o and r built from a stroked circle, a
 * vertical stem and a shoulder arc.
 */
function glyph(transform, stroke) {
  return `
  <g transform="${transform}" fill="none" stroke="${stroke}" stroke-width="56" stroke-linecap="butt">
    <circle cx="437" cy="512" r="77"/>
    <path d="M 605 617 L 605 407"/>
    <path d="M 605 520 C 605 450 650 435 730 435"/>
  </g>`;
}

/** Adaptive-icon foreground: centered so it survives every launcher mask shape. */
const FOREGROUND_TRANSFORM = 'translate(512 512) scale(1.25) translate(-545 -512)';

const iconBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>${GRADIENT}</defs>
  <rect width="1024" height="1024" fill="url(#brand)"/>
</svg>`;

const iconForeground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${glyph(FOREGROUND_TRANSFORM, '#ffffff')}
</svg>`;

// Legacy square icon: gradient background with the mark composited on top, so it
// looks right on launchers that ignore adaptive icons.
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    ${GRADIENT}
    <radialGradient id="legacyGlow" cx="50%" cy="28%" r="75%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#brand)"/>
  <rect width="1024" height="1024" fill="url(#legacyGlow)"/>
  ${glyph(FOREGROUND_TRANSFORM, '#ffffff')}
</svg>`;

const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <defs>
    <radialGradient id="splashGlow" cx="50%" cy="46%" r="52%">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="2732" height="2732" fill="#0a0710"/>
  <rect width="2732" height="2732" fill="url(#splashGlow)"/>

  <!-- Vinyl record -->
  <circle cx="1366" cy="1366" r="620" fill="#150d26" stroke="#ffffff" stroke-opacity="0.14" stroke-width="4"/>
  <circle cx="1366" cy="1366" r="530" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="3"/>
  <circle cx="1366" cy="1366" r="440" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="3"/>
  <circle cx="1366" cy="1366" r="350" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="3"/>
  <circle cx="1366" cy="1366" r="620" fill="none" stroke="#ec4899" stroke-opacity="0.45" stroke-width="6"/>

  ${glyph('translate(1366 1366) scale(1.6) translate(-545 -512)', '#ffffff')}
</svg>`;

const targets = [
  ['assets/icon-background.png', iconBackground, 1024],
  ['assets/icon-foreground.png', iconForeground, 1024],
  ['assets/icon-only.png', iconOnly, 1024],
  ['assets/splash.png', splash, 2732],
  ['assets/splash-dark.png', splash, 2732],
  // Keeps the browser tab icon in step with the launcher icon.
  ['src/assets/icon/favicon.png', iconOnly, 196],
];

for (const [relative, svg, size] of targets) {
  const output = path.join(root, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(output);
  console.log(`wrote ${relative} (${size}x${size})`);
}

console.log('\nNow run: npx capacitor-assets generate --android');
