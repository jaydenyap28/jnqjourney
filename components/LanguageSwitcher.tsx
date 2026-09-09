'use client'

import { useEffect, useState } from 'react'
import { getLocale, localizedPath, type Locale } from '@/lib/locale'

export default function LanguageSwitcher({initialPath='/'}:{initialPath?:string}) {
  const [path, setPath] = useState<string>(initialPath)
  useEffect(() => {
    const update = () => setPath(window.location.pathname + window.location.search + window.location.hash)
    update()
    window.addEventListener('hashchange', update)
    window.addEventListener('popstate', update)
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update) }
  }, [])
  // The click reads the actual address, including App Router navigations since mount.
  function choose(event: React.MouseEvent<HTMLAnchorElement>, locale: Locale) {
    event.currentTarget.href = localizedPath(window.location.pathname + window.location.search + window.location.hash, locale)
    document.cookie = `jnq_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
  }
  return <nav aria-label="Choose language / 选择语言" className="inline-flex shrink-0 items-center rounded-full border border-amber-200/20 bg-[#080d16] px-1 text-xs text-white">
    {(['zh', 'en'] as const).map((locale, index) => <span className="inline-flex items-center" key={locale}>
      {index > 0 && <span aria-hidden="true" className="text-white/25">|</span>}
      <a href={localizedPath(path || '/', locale)} hrefLang={locale} lang={locale} onClick={event => choose(event, locale)}
        aria-current={path && getLocale(path) === locale ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 ${path && getLocale(path) === locale ? 'text-amber-200' : 'text-white/65 hover:text-white'}`}>
        {locale === 'zh' ? '中文' : 'EN'}
      </a>
    </span>)}
  </nav>
}
