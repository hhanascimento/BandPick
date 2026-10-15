# Google Play submission checklist

Everything code-side is already done. This file covers the parts that need your Google Play
Console account and your Android signing key.

---

## 1. Before you upload

- [ ] **Confirm the app ID.** `com.bandpick.app`. Your application ID
      becomes permanent the moment you publish, and it can never be changed afterwards.
  - update `appId` in `capacitor.config.ts`
  - update `applicationId` and `namespace` in `android/app/build.gradle`
  - update `package_name` and `custom_url_scheme` in
    `android/app/src/main/res/values/strings.xml`
  - move the Java package folder under `android/app/src/main/java/` to match
  - re-run `npm run android:sync`
- [ ] **Set the store link** in `src/environments/environment.ts` and `environment.prod.ts`
      (`playStoreUrl`), so shared results link back to the listing.
- [ ] **Set the version** in `android/app/build.gradle` (`versionCode 1`, `versionName "1.0"`).
      `versionCode` must increase with every upload.
- [ ] **Artist photos are bundled, not hotlinked.** 598 Commons photos (CC0 / public domain / CC BY
      / CC BY-SA) ship inside the app with per-image attribution in the Credits screen, so the app
      still makes no runtime network calls. Two things to confirm before promoting:
      - have someone check `docs/PHOTO_CREDITS.md`, especially the personality-rights note
      - accept the ~16 MB install size, or lower `THUMB_WIDTH`/`JPEG_QUALITY` in
        `scripts/build-catalogue.mjs` and re-run `download` + `prune` + `generate`

## 2. Target API level

New apps and updates must target **API 36 (Android 16)** from **31 August 2026** (an extension to
1 November 2026 is available to eligible developers).

Already satisfied:

```gradle
// android/variables.gradle
minSdkVersion = 24
compileSdkVersion = 36
targetSdkVersion = 36
```

## 3. Signing and the release bundle

1. Create an upload keystore (keep it backed up; losing it blocks future updates):

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA \
     -keysize 2048 -validity 10000 -alias upload
   ```

2. Add `android/keystore.properties` (and add it plus `*.jks` to `.gitignore` — **never commit a key**):

   ```properties
   storeFile=../upload-keystore.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```

3. Wire `signingConfigs` into `android/app/build.gradle` and build:

   ```bash
   npm run android:bundle     # -> android/app/build/outputs/bundle/release/app-release.aab
   ```

4. Upload the `.aab` and enroll in **Play App Signing**. Google holds the app-signing key; your
   upload key signs what you submit.

> An AAB is mandatory for new apps. APKs are only for local installation and non-Play distribution,
> so `npm run android:apk` is for testing only.

## 4. Store listing assets

| Asset | Requirement |
| --- | --- |
| App icon | 512 × 512 PNG with alpha, max 1 MB |
| Feature graphic | 1024 × 500 JPEG or 24-bit PNG, **no alpha** |
| Screenshots | at least 2 (JPEG/24-bit PNG, no alpha). 3+ portrait 9:16 at 1080px+ is recommended for game featuring. |
| Short description | up to 80 characters |
| Full description | up to 4000 characters |

Screens worth capturing: Home, the genre grid + format/size picker, the battle screen, the results
screen with the bracket for a knockout game, the **Listen to the band** Spotify section, and the
share area.

## 5. Mandatory declarations

- [ ] **Privacy policy.** Required even though this app collects nothing. There is a starting point
      in `docs/PRIVACY_POLICY.md` — host it at a public URL and paste that URL into the listing.
- [ ] **Data safety form.** Must be completed even for an app that collects no data. Declare
      "no data collected" (accurate as shipped: no accounts, no analytics, and no server of ours —
      the artist photos are packaged in the app rather than loaded from a remote host).
      Re-check this if you add an ad SDK or analytics.
- [ ] **Spotify embed (read this before answering the form).** The results screen embeds Spotify's
      own player, so the device contacts `open.spotify.com` once a game is finished. We send it
      nothing but the champion's artist id, and we receive nothing — but Spotify does see the
      request, and may set its own cookies inside the player. That is third-party content rather
      than data collection by the app, and it is disclosed in `docs/PRIVACY_POLICY.md`; keep the two
      documents saying the same thing. If you would rather avoid the question entirely, make the
      player click-to-load or drop it — the `spotify` section of `README.md` explains how.
- [ ] **Content rating questionnaire.** Expect "Everyone" / PEGI 3 — there is no user-generated
      content, no ads and no purchases.
- [ ] **Target audience and content.** Declare the intended age range.
- [ ] **Government apps / financial features / health** — not applicable.

## 6. Release track

Start with **Internal testing** to confirm the build launches, then promote:

`Internal testing → Closed testing → Open testing → Production`

Note that apps only on the internal testing track are exempt from the Data safety section, but the
exemption ends as soon as you move the release to any public track.

## 7. Test on a real device before promoting

The web build, the rendering tests and the integration with Capacitor were verified. The native
side was not, because this environment has no JDK or Android SDK. On a device or emulator, check:

- the app launches and the splash screen matches the dark theme
- the round slider (1–20), the genre grid and the battle tiles feel right, including the tap lock
- the **Bracket** format runs from setup to the final without losing its stage labels (it is
  covered by DOM tests, but the header wording is worth a human eye on a small screen)
- the native share sheet opens from `Share result`, and Instagram accepts the card image
- the Android back button behaves: from the battle screen it returns to setup, and it never
  re-enters a finished duel
- haptic feedback fires on tile taps
