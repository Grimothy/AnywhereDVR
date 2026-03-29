/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 
          DEFAULT: '#0f1117', 
          50: '#1a1d27', 
          100: '#232636', 
          200: '#2d3147' 
        },
        border: { 
          DEFAULT: '#2d3147', 
          muted: '#1a1d27' 
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    }
  },
  plugins: [],
}