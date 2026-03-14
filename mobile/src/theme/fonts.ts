import * as Font from 'expo-font';

export const fontAssets = {
  'Lexend-Light': require('../../assets/fonts/Lexend-Light.ttf'),
  'Lexend-Regular': require('../../assets/fonts/Lexend-Regular.ttf'),
  'Lexend-Medium': require('../../assets/fonts/Lexend-Medium.ttf'),
  'Lexend-SemiBold': require('../../assets/fonts/Lexend-SemiBold.ttf'),
  'Lexend-Bold': require('../../assets/fonts/Lexend-Bold.ttf'),
};

export { Font };

export type FontFamily = keyof typeof fontAssets;
