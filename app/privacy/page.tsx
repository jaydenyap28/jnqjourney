import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '隐私政策'
const description = 'JnQ Journey 关于分析工具、Cookie、Google AdSense、广告技术、联盟点击、WhatsApp、托管服务、嵌入内容与隐私选择的说明。'

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
        introduction={<p>JnQ Journey 会在提供网站、了解内容表现、保护服务、连接第三方功能及未来提供广告服务所需的范围内处理技术资料。本政策说明这些资料可能如何产生、使用，以及你可以如何管理相关选择。</p>}
        sections={[
          {
            title: '网站分析与技术资料',
            content: (
              <>
                <p>网站使用 Google Analytics、Vercel Analytics 与 Speed Insights 了解页面浏览、来源、设备类别、基本互动和性能表现。Cloudflare、Vercel 或其他基础设施也可能产生 IP 地址、浏览器、请求时间、错误与安全事件等服务器日志。</p>
                <p>这些资料主要用于汇总分析、排错、性能改善与防止滥用。我们不会刻意要求读者为了浏览一般旅游内容而提供姓名、身份证号码或付款资料。</p>
              </>
            ),
          },
          {
            title: 'Cookie 与类似技术',
            content: (
              <>
                <p>分析工具、必要网站功能、第三方嵌入内容及广告服务可能使用 Cookie、浏览器储存、像素、网络信标、IP 地址或其他识别技术。你可以通过浏览器设置限制或清除 Cookie，但部分功能、统计或个性化服务可能因此受到影响。</p>
                <p>当网站启用广告代码后，即使某个页面当下没有显示广告，相关广告标签仍可能请求 Google 或其他广告技术供应商的服务并使用适用的技术资料。</p>
              </>
            ),
          },
          {
            title: 'Google AdSense 与广告',
            content: (
              <>
                <p>JnQ Journey 可能使用 Google AdSense 展示广告。第三方供应商（包括 Google）可能使用 Cookie，根据用户此前访问本站或其他网站的情况提供、衡量或个性化广告。Google 及其合作伙伴也可能使用其他识别技术处理与广告投放、频次控制、成效衡量、防止无效流量及安全有关的资料。</p>
                <p>你可以前往 <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">Google 广告设置</a> 管理个性化广告选择。关于 Google 在合作伙伴网站或应用中如何使用资料，可参阅 <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">Google 的合作伙伴网站资料说明</a>。</p>
                <p>如未来使用其他第三方广告供应商或广告网络，我们会按适用要求更新本政策或相关同意界面，并提供相应的供应商说明和选择方式。</p>
              </>
            ),
          },
          {
            title: '欧洲地区同意管理',
            content: <p>若向欧洲经济区、英国或瑞士用户提供需要同意的广告或相关技术，我们会使用符合 Google 要求的同意管理平台（CMP）或其他适用机制来展示必要说明并收集相关选择。实际同意选项会以网站届时启用的同意界面为准。</p>,
          },
          {
            title: '联盟点击与外部预订',
            content: <p>我们可能记录联盟按钮的点击事件、页面位置、平台类别与匿名设备类别，以了解链接表现。完成预订、付款、取消或退款由第三方平台处理，其收集的资料受该平台自己的隐私政策和条款约束。</p>,
          },
          {
            title: 'WhatsApp 联系',
            content: (
              <>
                <p>WhatsApp 按钮会在浏览器中生成带有预填文字的外部链接。点击按钮不会自动把聊天内容传给本站；只有你在 WhatsApp 主动发送后，对话才会交给 WhatsApp 与接收方。</p>
                <p>本站分析事件不会刻意记录电话号码、WhatsApp 预填全文、姓名、电邮或你在对话中填写的具体内容。</p>
              </>
            ),
          },
          {
            title: '托管、数据库与媒体',
            content: <p>网站功能可能由 Vercel 托管，使用 Supabase 储存公开内容与应用资料，并通过 Cloudflare 与 Cloudflare R2 传送网页和媒体。这些服务可能依据其安全、运行、统计与合规需要处理技术日志。</p>,
          },
          {
            title: '嵌入内容与社交平台',
            content: <p>页面可能嵌入 YouTube、Facebook、Klook 或其他第三方内容，也会链接至社交平台。这些服务可能在你加载嵌入内容或打开链接时取得浏览器与设备资料；相关处理受第三方自身政策约束。</p>,
          },
          {
            title: '你的选择与联系',
            content: (
              <>
                <p>你可以通过浏览器设置限制非必要 Cookie、调整 Google 广告设置、不点击外部链接，或在第三方页面关闭前不提交任何资料。若对本政策、内容资料或隐私处理有问题，请通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提出。</p>
                <p>本政策会随网站功能、广告服务、服务供应商或适用要求变化而更新，并在本页标示最近更新日期。</p>
              </>
            ),
          },
        ]}
      />
    </>
  )
}
