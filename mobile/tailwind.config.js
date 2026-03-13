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
        // Aurora Glass Design System
        background: {
          deep:    "#020617",
          mid:     "#040816",
          surface: "rgba(255,255,255,0.03)",
        },
        glass: {
          DEFAULT:  "rgba(255,255,255,0.05)",
          elevated: "rgba(255,255,255,0.08)",
          border:   "rgba(255,255,255,0.10)",
          card:     "rgba(255,255,255,0.03)",
        },
        primary:   "#091A7A",
        secondary: "#ADC8FF",
        accent:    "#FF3366",
        success:   "#00FF88",
        warning:   "#FF9933",
        error:     "#FF0033",
        text: {
          primary:   "#FFFFFF",
          secondary: "rgba(255,255,255,0.60)",
          muted:     "rgba(255,255,255,0.40)",
          dim:       "rgba(255,255,255,0.20)",
        },
        risk: {
          low:      "#00FF88",
          medium:   "#FF9933",
          high:     "#FF9933",
          critical: "#FF0033",
        },
      },
      fontFamily: {
        sans:     ["Lexend_400Regular", "System"],
        light:    ["Lexend_300Light",   "System"],
        medium:   ["Lexend_500Medium",  "System"],
        semibold: ["Lexend_600SemiBold","System"],
        bold:     ["Lexend_700Bold",    "System"],
        mono:     ["JetBrainsMono_400Regular", "Courier"],
        "mono-bold": ["JetBrainsMono_700Bold", "Courier"],
      },
      borderRadius: {
        sm:       "12px",
        card:     "20px",
        modal:    "24px",
        pill:     "50px",
      },
    },
  },
  plugins: [],
};
