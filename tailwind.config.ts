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
        white: 'rgb(var(--surface-rgb) / <alpha-value>)',
        gray: {
          50: '#f7f5f0', 100: '#eeece6', 200: '#dcd9d2', 300: '#c6c3bd',
          400: '#898894', 500: '#717180', 600: '#656577', 700: '#484b60',
          800: '#2d3354', 900: '#1b1f3b',
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
