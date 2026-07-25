import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '隐私政策'
const description = 'JnQ Journey 关于分析工具、Cookie、技术日志、联盟点击、WhatsApp 外部链接、托管服务、嵌入内容与未来广告服务的隐私说明。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacy' },
  openGraph: buildOpenGraphData(title, description, '/privacy'),
  twitter: buildTwitterCardData(title, description),
}

export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description,
            url: absoluteUrl('/privacy'),
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl('/privacy') },
              ],
            },
          }),
        }}
      />
      <PolicyPageLayout
        eyebrow="Privacy Policy"
        title={title}
        updatedAt={POLICY_UPDATED_AT}
        introduction={<p>JnQ Journey 只在提供网站、了解内容表现、保护服务与连接第三方功能所需的范围内处理技术资料。本政策说明这些资料可能如何产生和使用。</p>}
        sections={[
          {
            title: '网站分析与技术资料',
            content: (
              <>
                <p>网站使用 Google Analytics、Vercel Analytics 与 Speed Insights 了解页面浏览、来源、设备类别、基本互动和性能表现。Cloudflare、Vercel 或其他基础设施也可能产生 IP 地址、浏览器、请求时间、错误与安全事件等服务器日志。</p>
                <p>这些资料主要用于汇总分析、排错、性能改善与防止滥用，不用于在本站建立你的旅行身份档案。</p>
              </>
            ),
          },
          {
            title: 'Cookie 与未来广告服务',
            content: (
              <>
                <p>分析工具与必要功能可能使用 Cookie、浏览器储存或类似技术。你可以在浏览器中限制或清除这些资料，但部分功能或统计可能因此受影响。</p>
                <p>网站可能在未来使用 Google AdSense 或其他广告服务；目前这段说明不表示广告已经启用。如日后启用，相关供应商可能依其政策使用 Cookie 或类似技术提供与衡量广告。</p>
              </>
            ),
          },
          {
            title: '联盟点击与外部预订',
            content: <p>我们可能记录联盟按钮的点击事件、页面位置、平台类别与匿名设备类别，以了解链接表现。完成预订、付款、取消或退款由第三方平台处理，其收集的资料受该平台隐私政策和条款约束。</p>,
          },
          {
            title: 'WhatsApp 联系',
            content: (
              <>
                <p>WhatsApp 按钮会在浏览器中生成带有预填文字的外部链接。点击按钮不会自动把聊天内容传给本站；只有你在 WhatsApp 主动发送后，对话才会交给 WhatsApp 与接收方。</p>
                <p>本站分析事件不会记录电话号码、WhatsApp 预填全文、姓名、电邮或你在对话中填写的资料。</p>
              </>
            ),
          },
          {
            title: '托管、数据库与媒体',
            content: <p>网站功能可能由 Vercel 托管，使用 Supabase 储存公开内容与应用资料，并通过 Cloudflare 与 Cloudflare R2 传送网页和媒体。这些服务可能依据其安全、运行与合规需要处理技术日志。</p>,
          },
          {
            title: '嵌入内容与社交平台',
            content: <p>页面可能嵌入 YouTube、Facebook、Klook 或其他第三方内容，也会链接至社交平台。这些服务可能在你加载嵌入内容或打开链接时取得浏览器与设备资料；相关处理受第三方自身政策约束。</p>,
          },
          {
            title: '你的选择与联系',
            content: (
              <>
                <p>你可以通过浏览器设置限制非必要 Cookie，不点击外部链接，或在第三方页面关闭前不提交任何资料。若对本政策、内容资料或隐私处理有问题，请通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提出。</p>
                <p>本政策会随网站功能、服务供应商或法律要求变化而更新，并在本页标示最近更新日期。</p>
              </>
            ),
          },
        ]}
      />
    </>
  )
}
