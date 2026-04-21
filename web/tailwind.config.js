/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Louize", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
