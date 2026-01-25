import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Browns
          "brown-dark": "#69311E",
          brown: "#9A4616",
          // Blues
          "navy-900": "#0E1219",
          "navy-800": "#1C222D",
          "navy-600": "#3C5676",
          "navy-300": "#A9BCD0",
          // Neutrals
          "neutral-50": "#F8F6F3",
          "neutral-100": "#E8E2DC",
          ice: "#D4E4F4",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
