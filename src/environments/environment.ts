// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  /** Shown in share text and on the share card. */
  appName: 'BandPick',

  /**
   * Set this to the Play Store listing URL once the app is published, e.g.
   * 'https://play.google.com/store/apps/details?id=com.bandpick.app'.
   *
   * Recommended: keep the same value in `environment.prod.ts`.
   * Facebook and Telegram cannot be pre-filled without a link, so those two
   * destinations fall back to the native share sheet while this is empty.
   */
  playStoreUrl: '',
};

/*
 * To ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`,
 * use the zone.js plugins mentioned in the Angular docs. This project runs zoneless,
 * so no polyfill is needed.
 */
