// src/theme/ThemeContext.tsx
// Adaptive dark/light theme — follows iOS/Android system preference

import React, { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type NoelleColors } from "./colors";

interface ThemeContextValue {
  colors: NoelleColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const value: ThemeContextValue = {
    colors: isDark ? darkColors : lightColors,
    isDark,
  };
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
