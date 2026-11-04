import localFont from 'next/font/local'

// Keep the existing discrete weights. Supplementary scripts use the same named
// family in site-fonts.css, before any system fallback, without online requests.
const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './fonts/poppins-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-poppins', display: 'swap', fallback: ['Poppins', 'Poppins Site Fallback'],
  adjustFontFallback: false,
})

const cormorantGaramond = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin-wght-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-wght-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-wght-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-wght-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-cormorant-garamond', display: 'swap', fallback: ['Cormorant Garamond', 'Cormorant Garamond Site Fallback'],
  adjustFontFallback: false,
})

export const siteFontClassName = `${poppins.variable} ${cormorantGaramond.variable} site-fonts font-sans antialiased`
