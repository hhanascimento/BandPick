import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bandpick.app',
  appName: 'BandPick',
  webDir: 'www',
  // Matches the app's dark theme so there is no white flash on launch.
  backgroundColor: '#0a0710',
  android: {
    // The game ships all of its content, so no cleartext traffic is needed.
    allowMixedContent: false,
  },
};

export default config;
