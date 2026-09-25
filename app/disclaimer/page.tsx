import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '免责声明'
const description = 'JnQ Journey 关于旅游资讯时效、个人体验、第三方服务、价格与预订、健康安全、签证交通及内容使用范围的免责声明。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/disclaimer' },
  openGraph: buildOpenGraphData(title, description, '/disclaimer'),
  twitter: buildTwitterCardData(title, description),
}

export default function DisclaimerPage() {
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
            url: absoluteUrl('/disclaimer'),
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl('/disclaimer') },
              ],
            },
          }),
        }}
      />
      <PolicyPageLayout
        eyebrow="Disclaimer"
        title={title}
        updatedAt={POLICY_UPDATED_AT}
        introduction={<p>JnQ Journey 提供旅游内容、路线整理与个人旅行记录，目的是帮助读者做行程研究与比较。本网站内容不构成对任何景点、交通、住宿、活动、供应商或行程结果的保证。</p>}
        sections={[
          {
            title: '旅游资讯可能变化',
            content: <p>营业时间、门票、交通班次、道路状况、天气、活动安排、房况、价格、库存、签证与入境要求都可能临时调整。即使页面曾在发布或更新时核对，出发、付款或预约前仍应向相关政府机构、交通单位、景点、酒店、航空公司或服务供应方确认最新资料。</p>,
          },
          {
            title: '个人体验与资料型内容',
            content: <p>Jayden &amp; Qing 的实际体验只代表相关旅行时间、当时条件与个人感受。网站也包含以公开资料整理的景点数据库页面，这类页面不代表所有地点均由我们亲自到访。有关区分方式可参阅<Link href="/editorial-policy" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">内容与编辑原则</Link>。</p>,
          },
          {
            title: '价格、预订与第三方服务',
            content: <p>本站可能链接至 Klook、Trip.com、酒店、航空公司、景点、供应商或其他第三方平台。实际交易、付款、退款、取消、保险、库存与服务履行由相关第三方负责。JnQ Journey 并非这些第三方服务的官方网站，除非页面另有明确说明，也不代替其最终确认文件。</p>,
          },
          {
            title: '联盟链接与商业合作',
            content: <p>部分外部链接可能属于联盟链接，符合条件的交易可能为本站带来佣金，通常不会增加读者费用。联盟关系、受邀体验或商业合作的说明请参阅<Link href="/affiliate-disclosure" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联盟链接与商业合作说明</Link>。</p>,
          },
          {
            title: '安全、健康与个人判断',
            content: <p>徒步、登山、水上活动、自驾、高海拔、极端天气、夜间活动及其他旅行项目都有自身风险。本站的一般经验或提醒不能替代专业医疗、安全、法律、保险或现场工作人员建议。读者应根据个人健康、能力、天气和现场状况自行判断，并遵守当地规定。</p>,
          },
          {
            title: '责任范围',
            content: <p>我们会尽力维持内容准确和可用，但不保证所有页面在任何时间都完整、无误或适合每位读者。因依赖过期资料、第三方变更、设备或网络问题、个人行程决定或不可控制事件造成的损失，应依实际责任关系向相关服务方处理。</p>,
          },
          {
            title: '发现错误',
            content: <p>如发现名称、地点、价格、开放资讯、图片来源或其他内容有误，欢迎通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提供页面链接与可核对来源，我们会检查并在适当情况下更新。</p>,
          },
        ]}
      />
    </>
  )
}
