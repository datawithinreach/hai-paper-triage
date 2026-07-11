/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18202a",
        muted: "#667085",
        line: "#d8dee8",
        panel: "#ffffff",
        soft: "#f5f7fa",
        "soft-2": "#edf4f2",
        accent: "#197064",
        "accent-strong": "#0f5c52",
        warn: "#9a5b00",
        danger: "#9f2d38",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        premium: "0 10px 28px rgba(20, 28, 38, 0.08)",
      }
    },
  },
  plugins: [],
}
