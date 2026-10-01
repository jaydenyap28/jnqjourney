import type { Metadata } from 'next'
import { ArrowRight, BookOpenCheck, BriefcaseBusiness, MessageCircle, ShieldCheck } from 'lucide-react'

import { PublicLink as Link } from '@/components/PublicLocale'
import SiteFooter from '@/components/SiteFooter'
import SocialMediaGrid from '@/components/SocialMediaGrid'
import WhatsAppButton from '@/components/WhatsAppButton'
import WhatsAppFloatingButton from '@/components/WhatsAppFloatingButton'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '联系 JnQ Journey'
const description = '通过 WhatsApp 联系 Jayden & Qing，进行旅游配套查询、报价、内容更正、商业合作或版权问题。'

const contactTypes = [
  { title: '旅游配套查询', description: '目的地、预计日期、出发地、成人与儿童人数、房间需求。', icon: MessageCircle },
  { title: '商业合作', description: '品牌、合作形式、内容范围、发布时间与预算方向。', icon: BriefcaseBusiness },
  { title: '内容更正', description: '附上相关页面、需要更正的位置与可核对资料。', icon: BookOpenCheck },
  { title: '版权相关', description: '请提供相关页面、作品说明、权利关系与希望处理方式。', icon: ShieldCheck },
] as const

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact' },
  openGraph: buildOpenGraphData(title, description, '/contact'),
  twitter: buildTwitterCardData(title, description),
}

export default function ContactPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        '@id': absoluteUrl('/contact#page'),
        url: absoluteUrl('/contact'),
        name: title,
        description,
        about: { '@id': absoluteUrl('/#organization') },
      },
    ],
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.15),transparent_30%),radial-gradient(circle_at_82%_45%,rgba(52,211,153,0.10),transparent_28%),linear-gradient(135deg,#111b2a_0%,#070d17_52%,#070a10_100%)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-sm font-semibold text-white/80 transition hover:text-white">JnQ Journey</Link>
            <Link href="/about" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 text-sm text-white/68 transition hover:bg-white/[0.06] hover:text-white">
              关于我们
            </Link>
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">Contact JnQ Journey</p>
              <h1 className="font-cjk-display mt-4 max-w-4xl text-4xl leading-tight md:text-6xl lg:text-7xl">想问旅游配套，直接找我们</h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/62 md:text-lg md:leading-9">无论是 Batam、Tioman、海南或其他旅游配套，把日期、人数和出发地告诉我们，我们会再帮你确认适合的方案与当期报价。</p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <WhatsAppButton
                  pageType="contact"
                  source="JNQ-CONTACT-HERO"
                  message={'你好，我从 JnQ Journey 的联系页面看到你们，想查询旅游配套。\n\n目的地：\n预计日期：\n出发地：\n成人：\n儿童及年龄：\n房间数量：\n其他要求：\n\n来源：JNQ-CONTACT-HERO'}
                  label="WhatsApp 联系 Jayden & Qing"
                  position="contact_hero"
                  eventName="contact_whatsapp_click"
                />
                <span className="text-xs leading-5 text-white/36">建议附上：目的地 · 日期 · 成人/儿童人数 · 出发地</span>
              </div>
            </div>

            <aside className="rounded-[26px] border border-white/10 bg-black/20 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/60">Before you message</p>
              <p className="mt-3 text-lg font-semibold">这样发，我们会更快看懂</p>
              <div className="mt-5 space-y-3 text-sm text-white/55">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">01 · 想去哪里</div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">02 · 预计出发日期</div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">03 · 成人 / 儿童人数</div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">04 · 出发地与其他需求</div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-18 px-5 py-16 md:px-8 md:py-22">
        <section>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">How can we help</p>
            <h2 className="font-cjk-display mt-3 text-3xl md:text-4xl">选择你要找我们的原因</h2>
            <p className="mt-4 leading-8 text-white/54">不用先写得很完整，只要把关键资料发过来就可以。旅游配套与合作询问最适合直接走 WhatsApp。</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {contactTypes.map((item, index) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.025] p-6 transition hover:border-white/18 hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-4">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/20">
                      <Icon className="h-5 w-5 text-amber-200" />
                    </span>
                    <span className="text-xs text-white/24">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/54">{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[30px] border border-amber-200/18 bg-amber-200/[0.045] p-6 md:p-9">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/65">WhatsApp first</p>
              <h2 className="font-cjk-display mt-3 text-3xl">旅游配套查询，直接从这里开始</h2>
              <p className="mt-4 max-w-3xl leading-8 text-white/58">我们会根据你提供的日期、人数和需求，再确认当期价格、房况与可安排内容。提交查询本身不代表完成预订。</p>
            </div>
            <WhatsAppButton
              pageType="contact"
              source="JNQ-CONTACT-MAIN"
              message={'你好，我从 JnQ Journey 的联系页面看到你们，想进行以下查询：\n\n查询类型：\n相关目的地：\n预计日期：\n人数：\n问题说明：\n\n来源：JNQ-CONTACT-MAIN'}
              label="开始 WhatsApp 查询"
              position="contact_main"
              eventName="contact_whatsapp_click"
            />
          </div>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/65">Find us elsewhere</p>
            <h2 className="font-cjk-display mt-3 text-3xl md:text-4xl">也可以在这些平台找到我们</h2>
            <p className="mt-4 leading-8 text-white/54">不同平台会分享不同形式的旅游内容。如果只是想继续看旅行灵感，也欢迎从你最常用的平台关注。</p>
          </div>
          <div className="mt-8">
            <SocialMediaGrid />
          </div>
        </section>

        <section className="border-t border-white/10 pt-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h2 className="text-xl font-semibold">关于回复与资料范围</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/45">配套价格、房况、船班与可出发日期会按实际查询时间重新确认。内容更正与版权相关问题会先核对资料，复杂事项可能需要较长处理时间。</p>
            </div>
            <Link href="/about" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/68 transition hover:bg-white/[0.05] hover:text-white">
              认识 JnQ Journey <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter />
      <WhatsAppFloatingButton pageType="contact" source="JNQ-CONTACT-FLOATING" />
    </main>
  )
}
