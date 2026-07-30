/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0f172a',
        'dark-surface': '#1e293b',
        'dark-card': '#334155',
      },
      boxShadow: {
        panel: '0 10px 30px -10px rgba(0,0,0,0.4)',
        'panel-hover': '0 12px 40px -10px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
