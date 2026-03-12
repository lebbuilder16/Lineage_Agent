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
        // Noelle Dark Design System
        background: {
          deep: "#000000",
          mid: "#181818",
          surface: "#282828",
        },
        glass: {
          DEFAULT: "rgba(59, 45, 143, 0.25)",
          elevated: "rgba(59, 45, 143, 0.40)",
          border: "rgba(255, 255, 255, 0.10)",
        },
        accent: {
          safe: "#5BC763",      // clean / confirmed safe
          danger: "#DD5656",    // rug / critical
          warning: "#F1AD4B",   // suspected / medium risk
          ai: "#622EC3",        // AI / analysis features — Noelle purple
          aiLight: "#B370F0",   // light purple variant
          cyan: "#53E9F6",      // highlight / interactive
          blue: "#4D65DB",      // info / links
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#AAAAAA",
          muted: "#666666",
          inverse: "#000000",
        },
        risk: {
          low: "#5BC763",
          medium: "#F1AD4B",
          high: "#E3A33D",
          critical: "#DD5656",
        },
      },
      fontFamily: {
        sans: ["Inter_400Regular", "Avenir", "System"],
        medium: ["Inter_500Medium", "Avenir-Medium", "System"],
        semibold: ["Inter_600SemiBold", "Avenir-Heavy", "System"],
        bold: ["Inter_700Bold", "Avenir-Black", "System"],
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
