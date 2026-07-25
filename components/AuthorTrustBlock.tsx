import Link from 'next/link'
import { ArrowRight, PenLine } from 'lucide-react'

export default function AuthorTrustBlock({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`border-y border-white/10 ${compact ? 'py-6' : 'py-8 md:py-10'}`} aria-label="作者信息">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-200/10 text-amber-100">
            <PenLine className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs uppercase text-amber-200/70">作者与整理</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Jayden &amp; Qing</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/58">
              JnQ Journey 旅游内容创作者，通过实拍照片、影片和路线整理分享马来西亚与海外旅行经验；资料型内容会结合公开来源核对，并持续更新。
            </p>
          </div>
        </div>
        <Link href="/about" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-amber-100 transition hover:text-white">
          认识我们 <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
