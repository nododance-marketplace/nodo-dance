import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--primary-rgb) / <alpha-value>)',
          light: 'rgb(var(--primary-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--primary-dark-rgb) / <alpha-value>)',
        },
        accent: {
          coral: 'rgb(var(--coral-rgb) / <alpha-value>)',
          magenta: 'rgb(var(--magenta-rgb) / <alpha-value>)',
          orange: 'rgb(var(--orange-rgb) / <alpha-value>)',
        },
        background: 'var(--color-paper)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        white: '#ffffff',
        /* Night-scale: 100–200 are dark hairlines/fills, 400–600 muted light
         * text, 700–900 bright emphasis text. */
        gray: {
          50: '#1b1e30', 100: '#22253c', 200: '#2b2f45', 300: '#9a9eb5',
          400: '#6f7390', 500: '#7d8093', 600: '#a2a5ba', 700: '#bfc2d2',
          800: '#e2e3ec', 900: '#f4f2eb',
        },
      },
      fontFamily: {
        sans: ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
        display: ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
