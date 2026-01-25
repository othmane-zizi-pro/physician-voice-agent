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
          // Warm/Earthy Tones
          "brown-dark": "#5D2B1B", // Deeper, richer brown
          brown: "#9A4616",       // Original brand brown
          "brown-light": "#C87A4B", // Lighter accent
          
          // Primary Navy/Blues
          "navy-950": "#0A0D12", // Almost black
          "navy-900": "#0E1219", // Original deep navy
          "navy-800": "#1C222D", // Card background
          "navy-700": "#2A3342", // Hover states
          "navy-600": "#3C5676", // Secondary text
          "navy-400": "#758CA6", // Muted text
          "navy-300": "#A9BCD0", // Borders
          
          // Neutrals & Backgrounds
          "neutral-50": "#F9FAFB", // Cleaner off-white
          "neutral-100": "#F3F4F6", 
          "neutral-200": "#E5E7EB",
          
          // Accents
          ice: "#E0F2FE",        // Vibrant light blue
          "ice-dark": "#BAE6FD", // Hover accent
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'subtle-mesh': 'radial-gradient(at 0% 0%, rgba(154, 70, 22, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(212, 228, 244, 0.4) 0px, transparent 50%)',
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
        'glass-hover': '0 8px 32px 0 rgba(0, 0, 0, 0.15)',
        'glow': '0 0 20px rgba(154, 70, 22, 0.3)',
      }
    },
  },
  plugins: [],
};
export default config;
