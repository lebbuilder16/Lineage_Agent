module.exports = {
  expo: {
    name: 'Lineage Agent',
    slug: 'lineage-agent-aol-o30jkjpa-4omqajv',
    scheme: 'lineage',
    version: '1.0.0',
    orientation: 'portrait',
    newArchEnabled: true,
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0A0A07',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lineageagent.app',
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSCameraUsageDescription: 'Used to take a profile photo',
        NSPhotoLibraryUsageDescription: 'Used to select a profile photo',
        NSClipboardUsageDescription: 'Used to copy wallet addresses and token information',
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
        ],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0A0A07',
      },
      package: 'com.lineageagent.app',
      // Use EAS secret file env var in CI, fall back to local file in dev
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      queries: {
        schemes: ['phantom', 'solflare', 'backpack'],
      },
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0A0A07',
          image: './assets/splash.png',
          dark: {
            backgroundColor: '#0A0A07',
          },
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#6F6ACF',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Lineage Agent to access your photos to set a profile picture.',
          cameraPermission: 'Allow Lineage Agent to use the camera to take a profile picture.',
        },
      ],
      'expo-secure-store',
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '0da4672c-0d43-4dc7-ab4c-11c1deb99387',
      },
    },
    owner: 'leb16',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/0da4672c-0d43-4dc7-ab4c-11c1deb99387',
    },
  },
};
