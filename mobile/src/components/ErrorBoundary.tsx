// src/components/ErrorBoundary.tsx
// Global React error boundary — catches uncaught render errors and shows a recovery UI

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { Sentry } from "@/src/lib/sentry";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Functional sub-component so we can use useTheme() hook */
function ErrorScreen({ message, onReset }: { message: string; onReset: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[base.container, { backgroundColor: colors.background.deep }]}>
      <Text style={base.emoji}>⚠️</Text>
      <Text style={[base.title, { color: colors.text.primary }]}>Something went wrong</Text>
      <Text style={[base.message, { color: colors.text.muted }]} numberOfLines={4}>
        {message}
      </Text>
      <TouchableOpacity
        style={[base.button, { backgroundColor: colors.glass.bg, borderColor: colors.glass.border }]}
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={[base.buttonText, { color: colors.accent.safe }]}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error.message);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          message={this.state.error?.message ?? "An unexpected error occurred."}
          onReset={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

const base = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emoji: { fontSize: 52 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
