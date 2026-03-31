/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Base palette ──────────────────────────────────────
        // Scale runs dark → light so higher numbers = more contrast
        navy: {
          DEFAULT: '#0f1629',   // deepest — page background
          800: '#1a2540',       // sidebar, topbar
          700: '#243052',       // card / panel surfaces
          600: '#2e3d65',       // input bg, secondary surfaces
          500: '#3d5080',       // borders, dividers
          400: '#6b82b0',       // muted text, icons, placeholders
          300: '#9aaed4',       // secondary text (labels, captions)
        },
        gold: {
          DEFAULT: '#f7c33a',   // primary accent — CTAs, active state
          hover: '#e5b22a',     // darker gold on hover
          muted: 'rgba(247,195,58,0.15)',
        },
        rust: {
          DEFAULT: '#c94d22',   // danger / delete / errors (slightly brighter for contrast)
          light: '#e05e30',     // hover / lighter danger
          muted: 'rgba(201,77,34,0.15)',
        },
        teal: {
          DEFAULT: '#72abb2',   // info, secondary, badges
          light: '#8ec5cc',     // hover
          muted: 'rgba(114,171,178,0.15)',
        },
        // ── Legacy aliases ────────────────────────────────────
        surface: {
          DEFAULT: '#243052',
          50: '#243052',
          100: '#2e3d65',
          200: '#3d5080',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
        display: ['"Outfit"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.35)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.6), 0 8px 28px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(247,195,58,0.3)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
