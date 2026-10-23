/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Figtree Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(31 41 55 / 0.06), 0 8px 24px -12px rgb(31 41 55 / 0.20)',
        lift: '0 2px 4px rgb(31 41 55 / 0.08), 0 18px 36px -16px rgb(185 28 28 / 0.45)',
      },
      colors: {
        // Paleta bolilla de bingo: rojo de marca, amarillo de acento, fondo crema.
        brand: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
          500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d',
        },
        accent: { 400: '#facc15', 500: '#eab308' },
        cream: '#fffaf2',
        ink: '#1f2937',
        night: { 900: '#0b1230', 800: '#131c45', 700: '#1c2860' },
      },
    },
  },
  plugins: [],
};
