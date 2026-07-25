import type { Metadata } from 'next'
import { BookOpenCheck, BriefcaseBusiness, CircleHelp, MessageCircle, ShieldCheck } from 'lucide-react'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import WhatsAppButton from '@/components/WhatsAppButton'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '联系 JnQ Journey'
const description = '通过 WhatsApp 联系 Jayden & Qing，进行旅游配套咨询、内容更正、商业合作、版权问题或一般查询。'

const contactTypes = [
  { title: '旅游配套咨询', description: '请提供目的地、预计日期、出发地、成人与儿童人数。', icon: MessageCircle },
  { title: '内容更正', description: '请附上页面链接、需要更正的段落与可核对来源。', icon: BookOpenCheck },
  { title: '商业合作', description: '请说明品牌、合作形式、内容范围与预计时间。', icon: BriefcaseBusiness },
  { title: '版权问题', description: '请提供相关页面、作品说明、权利关系与期望处理方式。', icon: ShieldCheck },
  { title: '一般问题', description: '网站使用、内容建议或其他非紧急事项。', icon: CircleHelp },
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
        breadcrumb: { '@id': absoluteUrl('/contact#breadcrumb') },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': absoluteUrl('/contact#breadcrumb'),
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '联系我们', item: absoluteUrl('/contact') },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <PolicyPageLayout
        eyebrow="Contact"
        title={title}
        introduction={<p>请选择与你的问题最接近的类型，并通过 WhatsApp 告诉我们必要资料。我们没有在本站公开电邮；请勿发送与查询无关的敏感个人资料。</p>}
        sections={[
          {
            title: '查询类型',
            content: (
              <div className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
                {contactTypes.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="bg-[#090d14] p-5 last:sm:col-span-2">
                      <Icon className="h-5 w-5 text-amber-200" aria-hidden="true" />
                      <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/55">{item.description}</p>
                    </div>
                  )
                })}
              </div>
            ),
          },
          {
            title: '通过 WhatsApp 联系',
            content: (
              <>
                <p>点击按钮后，你会离开本网站并进入 WhatsApp。预填内容只帮助你开始对话；在你主动发送前，JnQ Journey 不会收到聊天内容。</p>
                <WhatsAppButton
                  pageType="contact"
                  source="JNQ-CONTACT"
                  message={'你好，我从 JnQ Journey 的联系页面看到你们，想进行以下查询：\n\n查询类型：\n相关页面或目的地：\n问题说明：\n\n来源：JNQ-CONTACT'}
                  label="WhatsApp 联系 Jayden & Qing"
                  position="contact_main"
                  eventName="contact_whatsapp_click"
                />
              </>
            ),
          },
          {
            title: '回复与资料范围',
            content: <p>旅游价格、库存和可出发日期须向供应商确认，我们不会把初步查询视为已预订。内容与版权问题会先核对资料；复杂问题可能需要较长处理时间。</p>,
          },
        ]}
      />
    </>
  )
}
