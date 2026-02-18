/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0f1729',
        },
        forest: {
          50: '#f0faf0',
          100: '#dcf5dc',
          200: '#b8eab8',
          300: '#86d986',
          400: '#4fc14f',
          500: '#2da62d',
          600: '#228722',
          700: '#1a6b1a',
          800: '#155515',
          900: '#0f3f0f',
          950: '#071f07',
        },
      },
      animation: {
        'spin': 'spin 1s linear infinite',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};