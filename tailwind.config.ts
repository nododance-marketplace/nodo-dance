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
          DEFAULT: '#1B1F3B',
          light: '#2D3354',
          dark: '#0F1123',
        },
        accent: {
          coral: '#FF6F61',
          magenta: '#C2185B',
          orange: '#FF8C42',
        },
        background: '#F2F2F2',
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
