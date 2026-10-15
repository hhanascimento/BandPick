// Polyfills for running unit tests under jsdom (the default Vitest environment).

// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no 2D canvas context. Left alone it reports the missing API through
// the virtual console with a full stack trace, which is slow enough to push
// canvas-touching tests towards their timeout. Returning null explicitly instead
// exercises ShareCardService's real "canvas unavailable" branch deterministically.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(): null {
    return null;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
