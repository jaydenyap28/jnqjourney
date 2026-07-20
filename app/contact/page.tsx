import type { Metadata } from 'next'

import SiteFooter from '@/components/SiteFooter'
import WhatsAppButton from '@/components/WhatsAppButton'

export const metadata: Metadata = {
  title: '联系我们',
  description: '通过 WhatsApp 联系 JnQ Journey，咨询旅游配套或行程安排。',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto flex min-h-[75svh] max-w-4xl flex-col justify-center px-5 py-20 md:px-8">
        <p className="text-xs uppercase text-amber-200/70">Jayden &amp; Qing</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">一起把想去的地方，整理成可以出发的行程。</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">旅游日期、人数和出发地点都会影响安排与报价。通过 WhatsApp 告诉我们基本需求，我们会按现有资料回复。</p>
        <div className="mt-8">
          <WhatsAppButton pageType="contact" source="JNQ-CONTACT-PAGE" label="打开 WhatsApp 咨询" position="page_bottom" />
        </div>
        <p className="mt-4 text-xs text-white/45">点击 WhatsApp 后，将离开本站并进入 WhatsApp。本站不会自动储存你的咨询内容。</p>
      </section>
      <SiteFooter />
    </main>
  )
}
