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
        // Permission strings (required by iOS or app crashes at runtime)
        NSPhotoLibraryUsageDescription:
          'Lineage Agent uses your photo library to set your profile picture.',
        NSCameraUsageDescription:
          'Lineage Agent can use your camera to take a profile picture.',
        // Encryption export compliance — exempt under EAR 740.17(b)(1)
        // (encryption used only for authentication / standard HTTPS)
        ITSAppUsesNonExemptEncryption: false,
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
      'expo-secure-store',
      'expo-web-browser',
      [
        // Privacy Manifest (PrivacyInfo.xcprivacy) — required by Apple since May 2024.
        // Declares "required reason API" usage for AsyncStorage, expo-secure-store,
        // expo-file-system, and Privy SDK. None of these track the user.
        'expo-build-properties',
        {
          ios: {
            privacyManifests: {
              NSPrivacyAccessedAPITypes: [
                {
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
                  NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
                },
                {
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
                  NSPrivacyAccessedAPITypeReasons: ['C617.1'],
                },
                {
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
                  NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
                },
                {
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
                  NSPrivacyAccessedAPITypeReasons: ['E174.1'],
                },
              ],
              NSPrivacyTracking: false,
            },
          },
        },
      ],
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
