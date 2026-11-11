import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gg.vel.zombies',
  appName: 'Vel.gg Zombies',
  webDir: 'www',

  // Load the real game directly inside the WebView
  server: {
    url: 'https://vel.gg',
    cleartext: false,
    allowNavigation: ['vel.gg', '*.vel.gg']
  },

  android: {
    allowMixedContent: false,
    backgroundColor: '#000000'
  },

  ios: {
    backgroundColor: '#000000',
    contentInset: 'automatic',
    allowsLinkPreview: false
  },

  plugins: {
    // Keep the screen on while playing
    // (requires @capacitor-community/keep-awake or similar)
  }
};

export default config;
