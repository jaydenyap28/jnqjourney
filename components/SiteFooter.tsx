import Link from 'next/link'
import { BookOpenText, Facebook, Instagram, MessageCircle, Music2, Youtube } from 'lucide-react'

import TrackedLink from '@/components/TrackedLink'
import WhatsAppButton from '@/components/WhatsAppButton'
import { SOCIAL_LINKS } from '@/lib/brand'

const socialIcons = {
  YouTube: Youtube,
  Facebook,
  Instagram,
  TikTok: Music2,
  小红书: BookOpenText,
}

const exploreLinks = [
  { label: '地区目录', href: '/region' },
  { label: '旅游景点', href: '/' },
  { label: '完整攻略', href: '/guide' },
  { label: '长文笔记', href: '/notes' },
  { label: '旅游配套', href: '/packages' },
]

const policyLinks = [
  { label: '关于我们', href: '/about' },
  { label: '联系我们', href: '/contact' },
  { label: '隐私政策', href: '/privacy' },
  { label: '内容与编辑原则', href: '/editorial-policy' },
  { label: '联盟链接说明', href: '/affiliate-disclosure' },
  { label: '版权说明', href: '/copyright' },
]

export default function SiteFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-[#04070d] text-white">
      <div className="mx-auto max-w-[1200px] px-5 pb-24 pt-12 md:px-8 md:pt-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-11 lg:grid-cols-[1.3fr_0.75fr_0.85fr_1.1fr] lg:gap-12">
          <section className="col-span-2 lg:col-span-1">
            <h2 className="font-editorial-title text-4xl leading-none">Jayden &amp; Qing</h2>
            <p className="font-cjk-display mt-2 text-xl text-white/88">一起看世界</p>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/55">
              旅游地图、景点资料、路线攻略与旅行记录，由 JnQ Journey 持续整理。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_LINKS.map((social) => {
                const Icon = socialIcons[social.label]
                return (
                  <TrackedLink
                    key={social.label}
                    href={social.href}
                    external
                    eventName="social_link_click"
                    linkLabel={social.label}
                    ariaLabel={`在新窗口打开 ${social.label}`}
                    title={social.label}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </TrackedLink>
                )
              })}
            </div>
          </section>

          <nav aria-label="探索">
            <h2 className="text-sm font-semibold text-white">探索</h2>
            <ul className="mt-5 space-y-3 text-sm text-white/55">
              {exploreLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="inline-flex min-h-7 items-center transition hover:text-white">{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="网站说明">
            <h2 className="text-sm font-semibold text-white">网站说明</h2>
            <ul className="mt-5 space-y-3 text-sm text-white/55">
              {policyLinks.map((item) => (
                <li key={item.href}>
                  <TrackedLink
                    href={item.href}
                    eventName="policy_link_click"
                    linkLabel={item.label}
                    className="inline-flex min-h-7 items-center transition hover:text-white"
                  >
                    {item.label}
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </nav>

          <section className="col-span-2 border-t border-white/10 pt-7 lg:col-span-1 lg:border-t-0 lg:pt-0">
            <h2 className="text-sm font-semibold text-white">联系 Jayden &amp; Qing</h2>
            <p className="mt-5 text-sm leading-7 text-white/55">
              旅游配套、内容更正、商业合作或版权问题，可通过 WhatsApp 联系我们。
            </p>
            <div className="mt-5">
              <WhatsAppButton
                pageType="contact"
                source="JNQ-FOOTER"
                message={'你好，我从 JnQ Journey 网站看到你们，想进行查询。\n\n查询类型：\n问题说明：\n\n来源：JNQ-FOOTER'}
                label="WhatsApp 咨询"
                position="footer"
                className="w-full sm:w-auto"
              />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-white/38">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              将在新窗口打开 WhatsApp
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="max-w-4xl text-xs leading-6 text-white/38">
            部分预订入口可能是联盟链接；符合条件的交易可能为本站带来佣金，通常不会增加读者费用。价格、库存与条款以相关供应方最终确认结果为准。
          </p>
          <div className="mt-4 flex flex-col gap-3 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
            <p>© {currentYear} Jayden &amp; Qing · JnQ Journey. All rights reserved.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <TrackedLink href="/privacy" eventName="policy_link_click" linkLabel="隐私政策" className="transition hover:text-white">隐私政策</TrackedLink>
              <TrackedLink href="/affiliate-disclosure" eventName="policy_link_click" linkLabel="联盟链接说明" className="transition hover:text-white">联盟说明</TrackedLink>
              <TrackedLink href="/copyright" eventName="policy_link_click" linkLabel="版权说明" className="transition hover:text-white">版权说明</TrackedLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
