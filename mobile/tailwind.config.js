/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Dark Intel Design System
        background: {
          deep: "#0A0A0F",
          mid: "#111118",
          surface: "#16161F",
        },
        glass: {
          DEFAULT: "rgba(255, 255, 255, 0.07)",
          elevated: "rgba(255, 255, 255, 0.12)",
          border: "rgba(255, 255, 255, 0.08)",
        },
        accent: {
          safe: "#00FF9D",     // clean / confirmed safe
          danger: "#FF3B5C",   // rug / critical
          warning: "#FFB547",  // suspected / medium risk
          ai: "#9B59F7",       // AI / analysis features
          blue: "#3B82F6",     // info / links
        },
        text: {
          primary: "#F0F0FF",
          secondary: "#B0B0CC",
          muted: "#6B6B8A",
          inverse: "#0A0A0F",
        },
        risk: {
          low: "#00FF9D",
          medium: "#FFB547",
          high: "#FF7A2F",
          critical: "#FF3B5C",
        },
      },
      fontFamily: {
        sans: ["Inter_400Regular", "System"],
        medium: ["Inter_500Medium", "System"],
        semibold: ["Inter_600SemiBold", "System"],
        bold: ["Inter_700Bold", "System"],
        mono: ["JetBrainsMono_400Regular", "Courier"],
        "mono-bold": ["JetBrainsMono_700Bold", "Courier"],
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
        modal: "24px",
      },
    },
  },
  plugins: [],
};
