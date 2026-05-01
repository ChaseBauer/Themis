/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#1a1f2e',
          hover: '#252d40',
          active: '#2d3748',
          text: '#8892a4',
          textActive: '#e2e8f0',
          border: '#2d3748',
        },
      },
    },
  },
  plugins: [],
}
