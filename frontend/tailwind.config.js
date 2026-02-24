/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          50: "#eef9ff",
          100: "#d9f1ff",
          200: "#bce7ff",
          300: "#8ed9ff",
          400: "#59c2ff",
          500: "#33a6ff",
          600: "#1b87f5",
          700: "#146fe1",
          800: "#1759b7",
          900: "#194c90",
          950: "#132f57",
        },
      },
    },
  },
  plugins: [],
};
