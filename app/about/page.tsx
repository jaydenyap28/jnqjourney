import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import TrackedLink from '@/components/TrackedLink'
import WhatsAppButton from '@/components/WhatsAppButton'
import { CREATORS, SOCIAL_LINKS } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '关于 JnQ Journey｜Jayden & Qing 一起看世界'
const description = '认识 JnQ Journey 与 Jayden & Qing。我们通过实拍照片、影片、景点资料、路线攻略和真实旅行经验，分享马来西亚及海外旅游内容。'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/about' },
  openGraph: buildOpenGraphData(title, description, '/about'),
  twitter: buildTwitterCardData(title, description),
}

export default function AboutPage() {
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
        breadcrumb: { '@id': absoluteUrl('/about#breadcrumb') },
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
      {
        '@type': 'BreadcrumbList',
        '@id': absoluteUrl('/about#breadcrumb'),
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '关于我们', item: absoluteUrl('/about') },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <PolicyPageLayout
        eyebrow="About JnQ Journey"
        title="关于 JnQ Journey"
        introduction={
          <p>
            JnQ Journey 是由 <span className="text-white">Jayden Yap</span> 与 <span className="text-white">Connie Qing</span> 共同经营的旅游内容网站。我们以“Jayden &amp; Qing 一起看世界”的公开署名，记录旅途中看见的风景、美食、住宿、交通与实际体验，并把资料整理成更容易查询的旅行参考。
          </p>
        }
        sections={[
          {
            title: '我们分享什么',
            content: (
              <>
                <p>网站结合旅游地图、景点资料、地区目录、完整路线、实拍图集、影片、旅行长文、旅游配套资讯与预订参考，帮助读者从寻找目的地逐步走到行程规划。</p>
                <ul className="grid gap-x-8 gap-y-2 border-l border-amber-200/25 pl-5 sm:grid-cols-2">
                  <li>景点介绍与实用资料</li>
                  <li>地区旅游目录</li>
                  <li>完整路线与每日行程</li>
                  <li>预算与交通参考</li>
                  <li>实拍照片与旅行影片</li>
                  <li>酒店、门票与活动参考</li>
                  <li>旅游配套比较与查询</li>
                </ul>
              </>
            ),
          },
          {
            title: '亲身记录与资料整理',
            content: (
              <>
                <p>内容可能来自实际旅行经验、实拍照片与影片、现场资料、官方公开信息及后续整理。只有具备相应记录的内容，我们才会明确使用“亲自到访”或“实际体验”等说法。</p>
                <p>部分景点页面属于旅游资料库整理，并不代表站内所有地点均由我们亲自到访。开放时间、价格、交通、房况和活动安排可能变化，出发前应以相关服务方的最新资料为准。</p>
              </>
            ),
          },
          {
            title: '我们的内容原则',
            content: (
              <ul className="space-y-2 border-l border-sky-200/20 pl-5">
                <li>尽量提供清楚、可核对且实用的旅行资料。</li>
                <li>区分个人体验、公开资料与商业资讯。</li>
                <li>不虚构价格、评分、库存或出发日期。</li>
                <li>发现错误后持续更新，并提供更正入口。</li>
              </ul>
            ),
          },
          {
            title: '联盟链接与旅游配套',
            content: (
              <>
                <p>部分页面可能包含 Klook、Trip.com 或其他平台的联盟链接。读者通过这些链接预订通常不会增加额外费用，JnQ Journey 可能获得少量佣金，用于支持网站维护和内容制作。</p>
                <p>旅游配套的价格、船班、房况、活动与附加费用均可能调整，最终须以供应商确认结果为准。JnQ Journey 是旅游内容网站，并不是旅行社、酒店、航空公司、景点或第三方预订平台的官方网站。</p>
                <Link href="/affiliate-disclosure" className="inline-flex min-h-11 items-center gap-2 font-semibold text-amber-100 transition hover:text-white">
                  阅读完整联盟说明 <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ),
          },
        ]}
        aside={
          <div className="space-y-7 border-t border-amber-200/25 pt-6">
            <div>
              <p className="text-xs uppercase text-amber-200/70">联系创作者</p>
              <p className="mt-3 text-sm leading-7 text-white/58">内容更正、合作或旅行咨询可通过 WhatsApp 联系 Jayden &amp; Qing。</p>
              <div className="mt-5">
                <WhatsAppButton
                  pageType="about"
                  source="JNQ-ABOUT"
                  message={'你好，我从 JnQ Journey 的关于我们页面看到你们，想进一步了解网站内容、合作或旅游咨询。\n\n来源：JNQ-ABOUT'}
                  label="WhatsApp 联系我们"
                  position="about_sidebar"
                  eventName="about_whatsapp_click"
                  className="w-full"
                />
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/38">
                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                将在新窗口打开 WhatsApp
              </p>
            </div>
            <div className="border-t border-white/10 pt-6">
              <p className="text-xs uppercase text-white/38">社交平台</p>
              <div className="mt-3 flex flex-col items-start gap-1">
                {SOCIAL_LINKS.map((social) => (
                  <TrackedLink
                    key={social.label}
                    href={social.href}
                    external
                    eventName="social_link_click"
                    linkLabel={social.label}
                    className="inline-flex min-h-10 items-center gap-2 text-sm text-white/62 transition hover:text-white"
                  >
                    {social.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </TrackedLink>
                ))}
              </div>
            </div>
          </div>
        }
      />
    </>
  )
}
