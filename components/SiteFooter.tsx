'use client'

import Link from 'next/link'
import { ArrowUpRight, MessageCircle } from 'lucide-react'

import WhatsAppButton from '@/components/WhatsAppButton'

function YouTubeLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#FF0033" d="M23.5 7.2a3.1 3.1 0 0 0-2.2-2.2C19.4 4.5 12 4.5 12 4.5s-7.4 0-9.3.5A3.1 3.1 0 0 0 .5 7.2 32.4 32.4 0 0 0 0 12a32.4 32.4 0 0 0 .5 4.8 3.1 3.1 0 0 0 2.2 2.2c1.9.5 9.3.5 9.3.5s7.4 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2A32.4 32.4 0 0 0 24 12a32.4 32.4 0 0 0-.5-4.8Z" /><path fill="#fff" d="m9.75 15.56 6.18-3.56-6.18-3.56v7.12Z" /></svg>
}

function FacebookLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#1877F2" d="M24 12A12 12 0 1 0 10.13 23.87v-8.4H7.08V12h3.05V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.4A12 12 0 0 0 24 12Z" /><path fill="#fff" d="M16.69 15.47 17.22 12h-3.33V9.76c0-.95.47-1.88 1.96-1.88h1.51V4.93s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.05v8.4c.61.09 1.23.13 1.87.13.64 0 1.26-.04 1.87-.13v-8.4h2.82Z" /></svg>
}

function InstagramLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="igFooterGradient" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#feda75" /><stop offset="35%" stopColor="#fa7e1e" /><stop offset="65%" stopColor="#d62976" /><stop offset="85%" stopColor="#962fbf" /><stop offset="100%" stopColor="#4f5bd5" /></linearGradient></defs><rect x="2.2" y="2.2" width="19.6" height="19.6" rx="6" fill="url(#igFooterGradient)" /><circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="17.4" cy="6.8" r="1.3" fill="#fff" /></svg>
}

function TikTokLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#111" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Z" /><path fill="#25F4EE" d="M10.53 9.18v5.61a1.79 1.79 0 1 1-1.27-1.71V10.5a4.44 4.44 0 1 0 3.93 4.42V8.93a5.3 5.3 0 0 0 3.1 1V7.39a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.78 1.78 0 0 1-.99 1.61c.05-.16.07-.33.07-.5V9.18h-.08Z" /><path fill="#FE2C55" d="M10.94 8.72v5.61a1.79 1.79 0 1 1-1.27-1.71v-2.58a4.44 4.44 0 1 0 3.93 4.42V8.47a5.3 5.3 0 0 0 3.1 1V6.93a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.79 1.79 0 0 1-1 1.61 1.92 1.92 0 0 0 .08-.5V8.72h-.08Z" /><path fill="#fff" d="M10.74 8.95v5.61a1.79 1.79 0 1 1-1.27-1.71v-2.58a4.44 4.44 0 1 0 3.93 4.42V8.7a5.3 5.3 0 0 0 3.1 1V7.16a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.79 1.79 0 0 1-1 1.61c.05-.16.08-.33.08-.5V8.95h-.08Z" /></svg>
}

function XHSLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#FF2442" /><path fill="#fff" d="M7.18 7.4h2.1l.98 1.48 1.35-1.48h2.12l-2.3 2.44 2.45 3.7h-2.1l-1.26-1.95-1.74 1.95H6.66l2.67-2.9L7.18 7.4Zm7.63.1h1.7v2.2l2.2-.74v1.62l-2.2.74v3.08c0 .32.15.48.45.48h1.75v1.62H16.4c-1.1 0-1.59-.46-1.59-1.5V7.5Z" /></svg>
}

const socials = [
  { label: 'YouTube', href: 'https://www.youtube.com/@jnqjourney', icon: YouTubeLogo },
  { label: 'Facebook', href: 'https://www.facebook.com/jnqjourney', icon: FacebookLogo },
  { label: 'Instagram', href: 'https://www.instagram.com/jnqjourney', icon: InstagramLogo },
  { label: 'TikTok', href: 'https://www.tiktok.com/@jnqjourney', icon: TikTokLogo },
  { label: '小红书', href: 'https://www.xiaohongshu.com/user/profile/60ab1c5d000000000101def8', icon: XHSLogo },
]

const exploreLinks = [
  { label: '地区目录', href: '/region' },
  { label: '旅游景点', href: '/' },
  { label: '完整攻略', href: '/guide' },
  { label: '长文笔记', href: '/notes' },
  { label: '最近更新', href: '/#latest' },
]

export default function SiteFooter() {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#04070d] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.07),transparent_42%),radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.05),transparent_38%)]" />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-24 pt-14 md:px-8 md:pb-24 md:pt-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.8fr_0.9fr_1.25fr] lg:gap-12">
          <section>
            <h2 className="font-editorial-title text-4xl leading-none">Jayden &amp; Qing</h2>
            <p className="font-cjk-display mt-2 text-xl text-white/88">一起看世界</p>
            <p className="mt-4 max-w-xs text-sm leading-7 text-white/55">把去过的地方慢慢写成下一次出发的理由</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {socials.map((social) => {
                const Icon = social.icon
                return <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={`在新窗口打开 ${social.label}`} title={social.label} className="group inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08]"><Icon className="h-5 w-5 transition group-hover:scale-105" /></a>
              })}
            </div>
          </section>

          <nav aria-label="探索">
            <h2 className="text-sm font-semibold text-white">探索</h2>
            <ul className="mt-5 space-y-3.5 text-sm text-white/55">{exploreLinks.map((item) => <li key={item.label}><Link href={item.href} className="inline-flex min-h-6 items-center transition hover:text-white">{item.label}</Link></li>)}</ul>
          </nav>

          <nav aria-label="旅游服务">
            <h2 className="text-sm font-semibold text-white">旅游服务</h2>
            <ul className="mt-5 space-y-3.5 text-sm text-white/55">
              <li><Link href="/packages" className="transition hover:text-white">旅游配套</Link></li>
              <li><Link href="/packages" className="transition hover:text-white">巴淡岛配套 <span className="ml-1 text-amber-200/65">即将上线</span></Link></li>
              <li><Link href="/contact" className="transition hover:text-white">WhatsApp 行程咨询</Link></li>
              <li><Link href="/contact" className="transition hover:text-white">商务合作</Link></li>
              <li><a href="https://www.facebook.com/jnqjourney" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition hover:text-white">Facebook 专页 <ArrowUpRight className="h-3.5 w-3.5" /></a></li>
            </ul>
          </nav>

          <section>
            <h2 className="text-sm font-semibold text-white">联系 Jayden &amp; Qing</h2>
            <p className="mt-5 text-sm leading-7 text-white/55">想查询旅游配套、商务合作或行程建议，可以通过 WhatsApp 联系我们。</p>
            <div className="mt-5">
              <WhatsAppButton
                pageType="contact"
                source="JNQ-FOOTER"
                message={'你好，我从 JnQ Journey 网站看到你们，想咨询旅游配套或合作。\n\n咨询类型：\n预计日期：\n人数：\n其他说明：\n\n来源：JNQ-FOOTER'}
                label="WhatsApp 咨询"
                position="footer"
                className="w-full sm:w-auto"
              />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-white/38"><MessageCircle className="h-3.5 w-3.5" />将在新窗口打开 WhatsApp</p>
          </section>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 md:mt-14">
          <p className="max-w-4xl text-xs leading-6 text-white/38">部分预订链接为联盟链接。通过链接预订不会增加你的费用，我们可能获得少量佣金，用于支持网站内容制作。</p>
          <div className="mt-4 flex flex-col gap-3 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
            <p>© {currentYear} Jayden &amp; Qing｜JnQ Journey. All rights reserved.</p>
            <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="法律与联系"><Link href="/privacy" className="transition hover:text-white">隐私政策</Link><Link href="/contact" className="transition hover:text-white">联系我们</Link><Link href="/privacy#affiliate-links" className="transition hover:text-white">联盟链接说明</Link></nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
