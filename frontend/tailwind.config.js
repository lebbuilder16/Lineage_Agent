/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-syne)", "ui-sans-serif", "system-ui", "sans-serif"],
        avenir: ['"Plus Jakarta Sans"', "var(--font-geist-sans)", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        neon: "#53E9F6",        /* Noelle cyan */
        mint: "#72E4C5",        /* Noelle mint/teal accent */
        purple: "#622EC3",      /* Noelle primary purple */
        "purple-light": "#B370F0",
        gain: "#6EC62F",        /* positive % labels */
        amber: "#DDA76E",       /* gold arrows & chart circles */
        pink: "#ED569D",        /* hot pink icon accent */
        "text-dim": "#878787",  /* dates & category labels */
        "text-label": "#A1A1A1", /* number labels */
        "ui-grey1": "#BBBBBB",  /* base elements */
        "ui-grey2": "#DDDDDD",  /* lines & dividers */
        "ui-grey3": "#EEEEEE",  /* near-white shapes */
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "0.25rem",           /* 4px */
        card: "1.5625rem",       /* 25px — Figma card radius */
        pill: "9999px",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #622EC3 0%, #4D65DB 29%, #379AEE 69%, #53E9F6 100%)",
        "gradient-purple":  "linear-gradient(135deg, #622EC3 0%, #B370F0 100%)",
        "gradient-gold":    "linear-gradient(135deg, #DC8E1F 0%, #F0B54F 50%, #F7E7AC 100%)",
        "gradient-chart":   "linear-gradient(180deg, #08D0E6 0%, #0ECEA6 100%)",
      },
      boxShadow: {
        card:         "0 30px 50px rgba(0,0,0,0.25)",
        "card-sm":    "0 15px 30px rgba(0,0,0,0.15)",
        "btn-primary":"0 15px 25px rgba(59,45,143,0.25)",
        "btn-hover":  "0 10px 20px rgba(59,45,143,0.25)",
        inner:        "inset 0 0 10px rgba(0,0,0,0.05)",
      },
      fontSize: {
        "display-xl": ["clamp(2.25rem, 6vw, 4.5rem)", { lineHeight: "0.92", fontWeight: "800" }],
        "display-lg": ["clamp(1.75rem, 4.5vw, 3.5rem)", { lineHeight: "0.95", fontWeight: "800" }],
        "display-md": ["clamp(1.25rem, 3vw, 2.25rem)", { lineHeight: "1.0", fontWeight: "700" }],
      },
      animation: {
        "marquee-left": "marquee-left 28s linear infinite",
        "marquee-right": "marquee-right 32s linear infinite",
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-in-scale": "fade-in-scale 0.35s ease-out both",
        "slide-up": "slide-up 0.5s ease-out both",
      },
      keyframes: {
        "marquee-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-right": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-scale": {
          from: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
