'use client'
import { usePathname } from 'next/navigation'
import LanguageSwitcher from './LanguageSwitcher'
export default function PublicLanguageControl() {
  const path = usePathname()
  if (!path || path === '/' || path.startsWith('/admin')) return null
  return <div className="flex justify-end border-b border-white/5 bg-[#080d16] px-4 py-2 md:px-8"><LanguageSwitcher key={path} initialPath={path}/></div>
}
