// src/lib/toast.ts
// Typed wrapper around react-native-flash-message — "Dark Intel" design system

import { showMessage } from "react-native-flash-message";

export const toast = {
  success: (message: string, description?: string) =>
    showMessage({
      message,
      description,
      type: "success",
      backgroundColor: "#0D2E1C",
      color: "#00FF9D",
      duration: 2500,
    }),

  error: (message: string, description?: string) =>
    showMessage({
      message,
      description,
      type: "danger",
      backgroundColor: "#2E0D16",
      color: "#FF3B5C",
      duration: 3500,
    }),

  info: (message: string, description?: string) =>
    showMessage({
      message,
      description,
      type: "info",
      backgroundColor: "#170D2E",
      color: "#9B59F7",
      duration: 2500,
    }),

  warning: (message: string, description?: string) =>
    showMessage({
      message,
      description,
      type: "warning",
      backgroundColor: "#2E210D",
      color: "#FFB547",
      duration: 3000,
    }),
};
