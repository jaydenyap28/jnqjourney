'use client'

import { createContext, useContext, forwardRef, type ComponentProps, type ReactNode } from 'react'
import NextLink from 'next/link'
import { localizedPath, type Locale } from '@/lib/locale'
import { publicCopy } from '@/lib/public-copy'

const Context = createContext<Locale>('zh')
export function PublicLocaleProvider({locale, children}:{locale:Locale;children:ReactNode}) {
  return <Context.Provider value={locale}>{children}</Context.Provider>
}
export const usePublicLocale = () => useContext(Context)
export function PublicCopy({text}:{text:string}) { return publicCopy(usePublicLocale(),text) }

/** Keep Chinese client navigation; English crosses router boundaries by document. */
export const PublicLink = forwardRef<HTMLAnchorElement,ComponentProps<typeof NextLink>>(function PublicLink({href,...props},ref) {
  const locale=usePublicLocale()
  const target=typeof href==='string'?localizedPath(href,locale):href
  if(locale==='en' && typeof target==='string') {
    const {prefetch,replace,scroll,shallow,locale:nextLocale,legacyBehavior,passHref,onNavigate,...anchor}=props as ComponentProps<typeof NextLink> & {onNavigate?:unknown}
    return <a {...anchor} href={target} ref={ref}/>
  }
  return <NextLink {...props} href={target} ref={ref}/>
})
