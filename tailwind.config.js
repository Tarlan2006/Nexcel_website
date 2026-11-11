/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './licensing.html', './avtomatizaciya-excel.html', './telegram-boty.html', './vnedrenie-ii.html', './seo.html', './templates.html', './faq.html', './o-kompanii.html', './privacy.html', './404.html', './partials/*.html', './assets/include-partials.js', './assets/home.js', './scripts/news-templates.cjs'],
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
        emeraldOnDark: '#5FC79A',
        emeraldSoft: '#EAF3EE',
        emeraldInk: '#0B1F16',
        panelLight: '#F6F7F6',
        textOnDark: '#C3C7CF',
        textMutedOnDark: '#A3A8B3',
        gridBorderOnDark: '#262A31',
        outlineOnDark: '#3A4049',
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
