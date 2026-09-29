/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Home (the reference screen) tops out at Manrope 800. Most other
      // screens used `font-black` (900), which read heavier and made pages
      // feel like different apps — so black renders as 800 everywhere.
      fontWeight: {
        black: "800",
      },
      // Readability floor: `text-xs` (used for most subtext and helper copy)
      // was 12px and read as too small; 13px with a comfortable line height.
      fontSize: {
        xs: ["13px", { lineHeight: "18px" }],
      },
    },
  },
  plugins: [],
};
