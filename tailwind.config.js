/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  safelist: [
    { pattern: /^(bg|text|border)-(paper|paperSecondary|darkBg|textMain|textMuted|emeraldAccent|emeraldHover|emeraldLight|gridBorder|gridBorderDark)(\/.*)?$/ },
    'hidden',
    'rotate-180'
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FBFBFA',
        paperSecondary: '#F4F4F0',
        darkBg: '#141619',
        textMain: '#181A1E',
        textMuted: '#5A5E67',
        emeraldAccent: '#1B6B44',
        emeraldHover: '#145333',
        emeraldLight: '#EBF5F0',
        gridBorder: '#E5E7EB',
        gridBorderDark: '#2A2E35'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        // Single source of truth for every heading (h1–h6) on the site — change once here,
        // not per element. Manrope: unified rounded Cyrillic/Latin, was previously H1-only.
        heading: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
