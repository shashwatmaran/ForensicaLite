import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */

/*
 * Design tokens for an investigative instrument, not a marketing site.
 *
 * Rules this palette enforces:
 *  - Neutrals carry the whole interface. Colour is reserved for severity, so
 *    when something is coloured it means something.
 *  - Small radii (2-6px). Nothing is a pill or a circle.
 *  - A dense type scale: 13px body, because a forensic report is a data
 *    surface, not a landing page.
 *  - Hairline borders instead of shadows. Elevation is communicated by
 *    surface value, the way native tooling does it.
 */

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Near-neutral ink scale with a trace of cool. Deliberately not
        // Tailwind's slate — that palette is a fingerprint.
        ink: {
          950: '#0a0b0d',
          900: '#101216',
          850: '#15181d',
          800: '#1b1f26',
          750: '#20252d',
          700: '#262b33',
          600: '#363c46',
          500: '#4d545f',
          400: '#6b737f',
          300: '#8f97a3',
          200: '#b7bec8',
          100: '#dde1e7',
          50: '#f2f4f7',
          25: '#f8f9fb',
        },
        // Single accent: a muted, slightly teal-shifted green. Used for
        // selection, focus and the brand mark. Never for data.
        accent: {
          900: '#0a3d29',
          800: '#0f5638',
          700: '#14724a',
          600: '#18915d',
          500: '#1faa6d',
          400: '#35c08a',
          300: '#5fd3a5',
          200: '#95e5c4',
          100: '#c9f3e0',
        },
        // Semantic severity. Tuned for legibility on ink-900 and on white,
        // and to stay distinguishable for the most common colour deficiencies
        // (they differ in lightness as well as hue).
        sev: {
          critical: '#f2555a',
          high: '#f0913f',
          medium: '#dcbb45',
          low: '#5aa9e6',
          info: '#8f97a3',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI Variable Text',
          'Segoe UI',
          'Inter',
          'Roboto',
          'sans-serif',
        ],
        // Forensic identifiers - paths, hashes, timestamps, record numbers -
        // are always monospaced so columns align and digits are comparable.
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Cascadia Mono',
          'Segoe UI Mono',
          'Consolas',
          'Liberation Mono',
          'Menlo',
          'monospace',
        ],
      },
      fontSize: {
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.08em' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.3125rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }],
        '3xl': ['2.25rem', { lineHeight: '2.625rem' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
        lg: '6px',
      },
      spacing: {
        rail: '13.5rem',
        topbar: '3.25rem',
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 140ms ease-out',
      },
    },
  },
  plugins: [
    /*
     * Dark is the base theme, light is the exception — so unprefixed classes
     * are the dark values and `light:` overrides them. This inverts Tailwind's
     * usual `dark:` convention on purpose: it removes a prefix from the
     * overwhelming majority of classes, and it makes the intended theme the
     * one you read in the markup.
     */
    plugin(({ addVariant }) => {
      addVariant('light', 'html.light &');
    }),
  ],
};
