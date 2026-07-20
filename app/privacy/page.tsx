import type { Metadata } from 'next'

import SiteFooter from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: '隐私政策',
  description: 'JnQ Journey 网站的分析、Cookie、联盟链接与外部联系方式说明。',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <article className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <p className="text-xs uppercase text-amber-200/70">JnQ Journey</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-5xl">隐私政策</h1>
        <p className="mt-5 leading-8 text-white/65">本网站以旅游内容、地图、攻略和相关预订资讯为主。我们尽量只收集维持网站运行和了解内容表现所需的最低限度资料。</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-white/70">
          <section>
            <h2 className="text-xl font-semibold text-white">网站分析与 Cookie</h2>
            <p className="mt-2">我们可能使用 Google Analytics、Vercel Analytics 和必要 Cookie，统计页面浏览、设备类别以及按钮点击。分析事件不会包含 WhatsApp 预填内容、姓名、电话号码或其他个人资料。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">联盟链接</h2>
            <p className="mt-2">部分 Klook、Trip.com 或其他预订链接属于联盟链接。通过这些链接预订不会增加你的费用，我们可能获得少量佣金，用于支持网站内容制作。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">WhatsApp 与外部网站</h2>
            <p className="mt-2">点击 WhatsApp 或联盟按钮后，你会离开本站并进入第三方服务。预填信息只在浏览器中生成并交给 WhatsApp，本网站不会自动储存或发送你的咨询内容。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">你的选择</h2>
            <p className="mt-2">你可以通过浏览器设置限制非必要 Cookie，也可以直接关闭第三方页面而不提交任何资料。本政策会随网站功能更新而调整。</p>
          </section>
        </div>
      </article>
      <SiteFooter />
    </main>
  )
}
