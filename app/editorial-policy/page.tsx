import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '内容与编辑原则'
const description = '了解 JnQ Journey 如何区分实际旅行体验与资料整理、核对和更新旅游信息、标示商业合作，并处理内容更正与 AI 辅助。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/editorial-policy' },
  openGraph: buildOpenGraphData(title, description, '/editorial-policy'),
  twitter: buildTwitterCardData(title, description),
}

export default function EditorialPolicyPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: absoluteUrl('/editorial-policy'),
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl('/editorial-policy') },
      ],
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <PolicyPageLayout
        eyebrow="Editorial Policy"
        title={title}
        updatedAt={POLICY_UPDATED_AT}
        introduction={<p>这些原则说明 JnQ Journey 如何制作、核对、更新和标示内容，让读者能够辨认实际体验、资料整理与商业资讯的差别。</p>}
        sections={[
          {
            title: '内容来源',
            content: <p>内容可能来自 Jayden &amp; Qing 的旅行记录、实拍照片与影片、现场资料、服务方提供的信息，以及政府机构、交通单位、景点、酒店和其他可核对的公开来源。</p>,
          },
          {
            title: '实际体验与资料整理',
            content: (
              <>
                <p>我们只在有相应照片、影片、票据、行程记录或现场观察支持时，将内容描述为亲自到访或实际体验。</p>
                <p>资料库型景点页可能以公开信息整理为主，不代表每个地点都由创作者亲自到访。个人观点与资料性事实会尽量在语气上清楚区分。</p>
              </>
            ),
          },
          {
            title: '核对、更新与时效',
            content: (
              <>
                <p>发布前会检查名称、地点、路线关系与重要实用信息；已有内容会在发现变化或收到可靠更正时更新。</p>
                <p>价格、营业时间、交通班次、签证规则、房况和活动安排可能随时改变。读者在出发或付款前，应向相关官方单位或服务供应方再次确认。</p>
              </>
            ),
          },
          {
            title: '图片与影片',
            content: <p>我们优先使用实拍媒体或已获准使用的资料。供应商、酒店、景点、合作方或第三方平台提供的图片、标志与海报仍由各自权利人拥有；相关素材不被宣称为 JnQ Journey 原创。</p>,
          },
          {
            title: '商业合作与联盟链接',
            content: (
              <>
                <p>付费、受邀、赠品或其他可能影响读者判断的互惠合作，会在适当位置说明。联盟佣金不会保证正面评价，也不会改变我们区分事实与意见的原则。</p>
                <Link href="/affiliate-disclosure" className="font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">查看联盟链接与商业合作说明</Link>
              </>
            ),
          },
          {
            title: '错误更正',
            content: <p>如发现名称、地址、价格、图片来源或其他内容有误，请通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提供页面链接、问题说明与可核对来源。我们会检查后修正，不会以保持旧内容为由忽略明确错误。</p>,
          },
          {
            title: 'AI 与软件辅助',
            content: <p>JnQ Journey 可能使用软件或人工智能工具协助整理资料、校对文字、处理图片尺寸或改善网站功能，但最终发布内容应经过人工检查。我们不会刻意使用 AI 虚构未发生的旅行经历、价格、评论或实际体验。</p>,
          },
        ]}
      />
    </>
  )
}
