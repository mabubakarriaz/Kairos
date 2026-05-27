/** @type {import('tailwindcss').Config} */
export default {
  // Scan Razor markup + TS so used classes survive purging.
  content: ["../Pages/**/*.cshtml", "./src/**/*.{ts,js}"],
  theme: {
    extend: {
      colors: {
        kairos: {
          block: "#2563eb",   // Kairos task blocks
          gcal: "#9333ea",    // read-only Google busy blocks
        },
      },
    },
  },
  plugins: [],
};
