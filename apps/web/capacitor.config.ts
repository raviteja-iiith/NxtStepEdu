import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nxtstep.edu',
  appName: 'NxtStepEdu',
  webDir: 'out',

  // ── Server mode: load the live deployed URL inside the WebView ──────────
  // This allows API routes, Supabase auth, and SSR to all work correctly.
  // Replace the URL below with your Vercel/production deployment URL.
  server: {
    url: 'https://app.nxtstepedu.in/',  // ← UPDATE with your production URL
    cleartext: false,
    // For local development testing, comment out the URL above and use:
    // url: 'http://YOUR_LOCAL_IP:3000',
    // cleartext: true,
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,  // set true for debug builds
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1E3A8A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1E3A8A',
      overlaysWebView: false,
    },
  },
};

export default config;
