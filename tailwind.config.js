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
        heading: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
