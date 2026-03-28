import * as Font from 'expo-font';

export const fontAssets = {
  // Body font — Lexend
  'Lexend-Light': require('../../assets/fonts/Lexend-Light.ttf'),
  'Lexend-Regular': require('../../assets/fonts/Lexend-Regular.ttf'),
  'Lexend-Medium': require('../../assets/fonts/Lexend-Medium.ttf'),
  'Lexend-SemiBold': require('../../assets/fonts/Lexend-SemiBold.ttf'),
  'Lexend-Bold': require('../../assets/fonts/Lexend-Bold.ttf'),
  // Display font — Space Grotesk (headings, hero numbers, scores)
  'SpaceGrotesk-Light': require('../../assets/fonts/SpaceGrotesk-Light.ttf'),
  'SpaceGrotesk-Regular': require('../../assets/fonts/SpaceGrotesk-Regular.ttf'),
  'SpaceGrotesk-Medium': require('../../assets/fonts/SpaceGrotesk-Medium.ttf'),
  'SpaceGrotesk-SemiBold': require('../../assets/fonts/SpaceGrotesk-SemiBold.ttf'),
  'SpaceGrotesk-Bold': require('../../assets/fonts/SpaceGrotesk-Bold.ttf'),
};

export { Font };

export type FontFamily = keyof typeof fontAssets;
