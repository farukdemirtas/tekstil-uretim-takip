import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      fontFamily: {
        /** next/font yok: OneDrive/Windows’ta .next içi font symlink (readlink) hatalarını önler */
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        surface:
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px -8px rgba(15, 23, 42, 0.09)",
        "surface-sm": "0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 12px -4px rgba(15, 23, 42, 0.06)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
