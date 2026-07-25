import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '联盟链接与商业合作说明'
const description = 'JnQ Journey 关于 Klook、Trip.com 等联盟链接、佣金、商业合作、旅游配套报价与第三方预订条款的公开说明。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/affiliate-disclosure' },
  openGraph: buildOpenGraphData(title, description, '/affiliate-disclosure'),
  twitter: buildTwitterCardData(title, description),
}

export default function AffiliateDisclosurePage() {
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
            url: absoluteUrl('/affiliate-disclosure'),
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl('/affiliate-disclosure') },
              ],
            },
          }),
        }}
      />
      <PolicyPageLayout
        eyebrow="Affiliate Disclosure"
        title={title}
        updatedAt={POLICY_UPDATED_AT}
        introduction={<p>为了让读者清楚了解网站如何获得支持，本页说明联盟链接、商业合作与旅游配套资讯之间的关系。</p>}
        sections={[
          {
            title: '联盟链接',
            content: <p>部分页面可能使用 Klook、Trip.com 或其他预订平台的联盟链接。并非所有外部链接都是联盟链接；我们会在适当位置标示预订或联盟性质。</p>,
          },
          {
            title: '费用与佣金',
            content: <p>读者通过联盟链接完成预订，通常不会因此增加额外费用。JnQ Journey 可能从符合条件的交易获得佣金，用于网站维护、资料整理与内容制作。</p>,
          },
          {
            title: '编辑独立性',
            content: <p>佣金、免费体验、折扣、赠品或付费合作不会保证正面评价。涉及付费或互惠利益的合作，我们会在适当位置说明，并保留表达真实意见与指出限制的权利。</p>,
          },
          {
            title: '旅游配套与报价',
            content: <p>网站显示的旅游配套、价格、房型、船班、名额、活动安排及附加费用仅供当前参考，最终以供应商或承办方确认的报价、库存与条款为准。发送查询不等同完成预订。</p>,
          },
          {
            title: '第三方平台',
            content: <p>JnQ Journey 不是 Klook、Trip.com、酒店、航空公司、景点或其他第三方服务的官方网站。付款前请在实际交易平台检查供应方身份、取消与退款规则、适用税费、保险及完整条款。</p>,
          },
          {
            title: '合作联系',
            content: <p>商业合作应以透明、可说明的方式进行。合作或媒体素材相关问题可通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提出。</p>,
          },
        ]}
      />
    </>
  )
}
