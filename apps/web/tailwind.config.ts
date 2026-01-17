import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./src/**/*.{js,jsx}"] ,
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        slate: "#94a3b8",
        accent: "#0ea5a6",
        "accent-strong": "#0f766e",
        "surface": "#ffffff",
        "surface-muted": "#f1f5f9"
      }
    }
  },
  plugins: []
};

export default config;
