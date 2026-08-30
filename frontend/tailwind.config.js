/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc5fb",
          400: "#36a6f7",
          500: "#0b8aeb",
          600: "#026dc9",
          700: "#0357a3",
          800: "#074a85",
          900: "#0c3e6e",
          950: "#082749",
        },
        slate: {
          850: "#151e2e",
          950: "#0b1120",
        },
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};
