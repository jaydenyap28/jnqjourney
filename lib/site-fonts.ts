import { Cormorant_Garamond, Noto_Sans_SC, Noto_Serif_SC, Poppins } from 'next/font/google'

const sans = Poppins({ subsets: ['latin'], weight: ['300', '400', '600', '800'], variable: '--font-poppins' })
const cjk = Noto_Sans_SC({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-noto-sans-sc' })
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-cormorant-garamond' })
const cjkSerif = Noto_Serif_SC({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-noto-serif-sc' })

export const siteFontClassName = `${sans.variable} ${cjk.variable} ${cjkSerif.variable} ${serif.variable}`
