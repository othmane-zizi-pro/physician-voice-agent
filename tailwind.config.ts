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
        meroka: {
          primary: "#9b420f",      // Burnt orange-brown (CTAs)
          "primary-hover": "#b54d12", // Lighter for hover
          secondary: "#18212d",    // Dark slate
          cream: "#F7F5F2",        // Light beige (primary bg)
          warm: "#FBF5EB",         // Warm peachy beige (secondary bg)
          text: "#18212d",         // Primary text on light
          "text-soft": "#1F1F1F",  // Softer text
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
