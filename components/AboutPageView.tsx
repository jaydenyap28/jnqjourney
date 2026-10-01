import { ArrowRight, Camera, Compass, MapPinned, MessageCircle, NotebookPen, Sparkles } from 'lucide-react'

import { PublicCopy } from '@/components/PublicLocale'
import { PublicLink as Link } from '@/components/PublicLocale'
import SiteFooter from '@/components/SiteFooter'
import SocialMediaGrid from '@/components/SocialMediaGrid'
import WhatsAppButton from '@/components/WhatsAppButton'
import { CREATORS } from '@/lib/brand'
import { absoluteUrl } from '@/lib/site'

const title = '关于 JnQ Journey｜Jayden & Qing 一起看世界'
const description = '认识 JnQ Journey 与 Jayden & Qing。我们通过实拍照片、影片、景点资料、路线攻略和真实旅行经验，分享马来西亚及海外旅游内容。'

const pillars = [
  {
    icon: Camera,
    title: '亲身记录',
    text: '把真正去过、看过、拍过的风景、美食、住宿和交通体验留下来。',
  },
  {
    icon: NotebookPen,
    title: '整理成攻略',
    text: '不只发照片，也把路线、费用、交通和实际注意事项整理成能直接参考的资料。',
  },
  {
    icon: MapPinned,
    title: '继续做成工具',
    text: '把景点、地区、路线、游记与旅游配套串起来，让规划旅行不必到处翻资料。',
  },
] as const

export default function AboutPageView() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': absoluteUrl('/about#page'),
        url: absoluteUrl('/about'),
        name: title,
        description,
        mainEntity: { '@id': absoluteUrl('/#organization') },
      },
      {
        '@type': 'ProfilePage',
        '@id': absoluteUrl('/about#profile'),
        url: absoluteUrl('/about'),
        mainEntity: {
          '@type': 'Organization',
          '@id': absoluteUrl('/#organization'),
          name: 'JnQ Journey',
          founder: CREATORS.map((creator) => ({
            '@type': 'Person',
            '@id': absoluteUrl(`/about#${creator.id}`),
            name: creator.name,
          })),
        },
      },
    ],
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_82%_36%,rgba(56,189,248,0.12),transparent_28%),linear-gradient(135deg,#111b2a_0%,#070d17_48%,#080c12_100%)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 md:px-8 md:pb-28 md:pt-14">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-sm font-semibold text-white/80 transition hover:text-white">JnQ Journey</Link>
            <Link href="/contact" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 text-sm text-white/68 transition hover:bg-white/[0.06] hover:text-white">
              <MessageCircle className="h-4 w-4 text-amber-200" />
              联系我们
            </Link>
          </div>

          <div className="mt-20 grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">About JnQ Journey</p>
              <h1 className="font-cjk-display mt-4 max-w-4xl text-4xl leading-tight md:text-6xl lg:text-7xl">
                <PublicCopy text="Jayden & Qing，一起把旅程整理成真正用得上的旅行参考" />
              </h1>
              <p className="mt-7 max-w-3xl text-base leading-8 text-white/64 md:text-lg md:leading-9">
                <PublicCopy text="JnQ Journey 是我们长期经营的旅游内容网站。我们记录自己走过的地方，也把沿途累积的景点、路线、交通、住宿和旅游配套资料整理起来，希望你在规划下一趟旅行时，可以少一点来回找资料，多一点真正出发的期待。" />
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/guides" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-amber-50">
                  浏览旅行攻略 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/packages" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-white/[0.03] px-5 text-sm font-medium text-white/76 transition hover:bg-white/[0.07] hover:text-white">
                  查看旅游配套
                </Link>
              </div>
            </div>

            <aside className="rounded-[28px] border border-white/10 bg-black/20 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-white/36">The people behind JnQ</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <p className="text-xs text-amber-200/60">Jayden</p>
                  <p className="mt-1 text-lg font-semibold">Jayden Yap</p>
                  <p className="mt-2 text-sm leading-6 text-white/48">拍摄、旅行记录、网站内容与路线整理</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <p className="text-xs text-amber-200/60">Qing</p>
                  <p className="mt-1 text-lg font-semibold">Connie Qing</p>
                  <p className="mt-2 text-sm leading-6 text-white/48">旅行体验、照片记录与内容分享</p>
                </div>
              </div>
              <p className="mt-5 text-xs leading-5 text-white/34">公开署名：Jayden & Qing 一起看世界</p>
            </aside>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-5 py-16 md:px-8 md:py-24">
        <section>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">What we do</p>
            <h2 className="font-cjk-display mt-3 text-3xl md:text-4xl">我们不只记录旅行，也把旅行整理出来</h2>
            <p className="mt-4 leading-8 text-white/56">照片和影片是旅程的一部分，但真正让网站长期有用的，是把这些经历继续整理成可以查询、比较和规划的内容。</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pillars.map((item, index) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.025] p-6">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/20">
                      <Icon className="h-5 w-5 text-amber-200" />
                    </span>
                    <span className="text-xs text-white/24">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/54">{item.text}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6 md:p-9">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/65">How we write</p>
              <h2 className="font-cjk-display mt-3 text-3xl md:text-4xl">去过的，我们会说去过；整理的，也会说清楚来源</h2>
              <p className="mt-5 max-w-3xl leading-8 text-white/58">JnQ Journey 里既有亲身到访的旅行记录，也有为了方便规划而整理的目的地资料。只有具备相应记录时，我们才会使用「亲自到访」「实拍」「实际体验」等表述；旅游配套页面也会区分 JnQ 实拍、重新整理的配套视觉与一般参考资料。</p>
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><Sparkles className="h-4 w-4 text-amber-200" /><p className="mt-3 text-sm font-medium">真实体验和资料整理分开表达</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><Compass className="h-4 w-4 text-emerald-200" /><p className="mt-3 text-sm font-medium">价格、交通与开放时间持续更新</p></div>
            </div>
          </div>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">Follow the journey</p>
            <h2 className="font-cjk-display mt-3 text-3xl md:text-4xl">在你常用的平台继续看我们的旅程</h2>
            <p className="mt-4 leading-8 text-white/54">网站负责把资料整理完整；不同社交平台则记录更多旅途当下、短视频、照片和即时分享。</p>
          </div>
          <div className="mt-8">
            <SocialMediaGrid />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-7 md:p-9">
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/65">Explore JnQ</p>
            <h2 className="font-cjk-display mt-3 text-3xl">从一个目的地，继续找到完整路线</h2>
            <p className="mt-4 max-w-2xl leading-8 text-white/55">可以先从景点、地区或攻略开始，也可以直接看我们整理好的旅游配套。JnQ Journey 会继续把这些内容连成更完整的旅行资料库。</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/destinations" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/72 transition hover:bg-white/[0.06] hover:text-white">浏览目的地 <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/packages" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/72 transition hover:bg-white/[0.06] hover:text-white">旅游配套 <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-amber-200/18 bg-amber-200/[0.055] p-7 md:p-8">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-100/65">Contact us</p>
            <h2 className="mt-3 text-2xl font-semibold">想问旅行或合作？</h2>
            <p className="mt-4 text-sm leading-7 text-white/55">旅游配套、内容更正、品牌合作或版权相关事务，都可以从我们的官方联系入口找到我们。</p>
            <div className="mt-6">
              <WhatsAppButton
                pageType="about"
                source="JNQ-ABOUT"
                message={"你好，我从 JnQ Journey 的关于我们页面看到你们，想进一步了解网站内容、合作或旅游咨询。\n\n来源：JNQ-ABOUT"}
                label="WhatsApp 联系 Jayden & Qing"
                position="about_bottom"
                eventName="about_whatsapp_click"
                className="w-full"
              />
            </div>
            <Link href="/contact" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm text-white/60 transition hover:text-white">查看其他联系类型 <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  )
}
