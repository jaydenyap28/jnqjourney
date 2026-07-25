import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import SiteFooter from '@/components/SiteFooter'

interface PolicySection {
  title: string
  eyebrow?: string
  content: ReactNode
}

interface PolicyPageLayoutProps {
  title: string
  eyebrow: string
  introduction: ReactNode
  sections: PolicySection[]
  updatedAt?: string
  aside?: ReactNode
}

export default function PolicyPageLayout({
  title,
  eyebrow,
  introduction,
  sections,
  updatedAt,
  aside,
}: PolicyPageLayoutProps) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#06090f] text-white">
      <header className="border-b border-white/10 bg-[#080d15]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4 text-amber-200" aria-hidden="true" />
            JnQ Journey
          </Link>
          <nav aria-label="网站说明导航" className="flex items-center gap-4 text-sm text-white/60">
            <Link href="/about" className="hidden transition hover:text-white sm:inline">关于我们</Link>
            <Link href="/contact" className="inline-flex items-center gap-1.5 transition hover:text-white">
              联系我们 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <article>
        <section className="border-b border-white/10 bg-[linear-gradient(125deg,#111a24_0%,#071017_55%,#10120f_100%)]">
          <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
            <p className="text-xs uppercase text-amber-200/75">{eyebrow}</p>
            <h1 className="font-cjk-display mt-4 max-w-4xl text-4xl leading-tight md:text-6xl">{title}</h1>
            <div className="mt-7 max-w-3xl text-base leading-8 text-white/68 md:text-lg md:leading-9">
              {introduction}
            </div>
            {updatedAt ? <p className="mt-6 text-xs text-white/38">最近更新：{updatedAt}</p> : null}
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {sections.map((section, index) => (
              <section key={section.title} className="border-t border-white/10 py-9 first:border-t-0 first:pt-0">
                <div className="grid gap-4 md:grid-cols-[64px_minmax(0,1fr)]">
                  <p className="text-sm font-semibold text-amber-200/70">{String(index + 1).padStart(2, '0')}</p>
                  <div>
                    {section.eyebrow ? <p className="text-xs uppercase text-white/38">{section.eyebrow}</p> : null}
                    <h2 className="font-cjk-display text-2xl leading-tight text-white md:text-3xl">{section.title}</h2>
                    <div className="mt-4 space-y-4 text-sm leading-7 text-white/66 md:text-base md:leading-8">
                      {section.content}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
          {aside ? <aside className="lg:sticky lg:top-8 lg:self-start">{aside}</aside> : null}
        </div>
      </article>
      <SiteFooter />
    </main>
  )
}
