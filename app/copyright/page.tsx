import type { Metadata } from 'next'
import Link from 'next/link'

import PolicyPageLayout from '@/components/PolicyPageLayout'
import { POLICY_UPDATED_AT } from '@/lib/brand'
import { buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site'

const title = '内容与图片版权说明'
const description = 'JnQ Journey 原创文字、实拍图片、影片、供应商素材、引用、转载与权利人投诉处理说明。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/copyright' },
  openGraph: buildOpenGraphData(title, description, '/copyright'),
  twitter: buildTwitterCardData(title, description),
}

export default function CopyrightPage() {
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
            url: absoluteUrl('/copyright'),
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
                { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl('/copyright') },
              ],
            },
          }),
        }}
      />
      <PolicyPageLayout
        eyebrow="Copyright"
        title={title}
        updatedAt={POLICY_UPDATED_AT}
        introduction={<p>本页说明 JnQ Journey 自有内容与第三方素材的权利范围，以及转载、引用和权利投诉的处理方式。</p>}
        sections={[
          {
            title: '原创内容',
            content: <p>除另有说明外，由 JnQ Journey 创作的文字、实拍照片与影片，其相关权利归创作者所有。未经许可，不得大规模复制、完整转载、建立镜像资料库或用于商业用途。</p>,
          },
          {
            title: '分享与短篇引用',
            content: <p>欢迎分享本站公开网页的原始链接。因评论、介绍或资料核对而引用少量内容时，请注明 JnQ Journey、原页面标题与可访问链接，不应让读者误以为转载内容由引用方原创。</p>,
          },
          {
            title: '第三方与供应商素材',
            content: <p>部分图片、标志、海报、房型资料或宣传素材可能由合作方、酒店、景点、旅行供应商或其他权利人提供，其权利仍属于原权利人。供应方提供的旅游配套价格海报不被宣称为 JnQ Journey 原创设计。</p>,
          },
          {
            title: '权利人通知',
            content: <p>如你是权利人并认为本站使用内容不当，请通过<Link href="/contact" className="mx-1 font-semibold text-amber-100 underline decoration-white/20 underline-offset-4 hover:text-white">联系页面</Link>提供相关页面、作品说明、权利关系与期望处理方式。我们会核对并在适当情况下更正来源、替换或移除内容。</p>,
          },
          {
            title: '个人资料',
            content: <p>本站不会为了版权声明公开创作者或联系人的私人住址。请勿在公开留言或一般咨询中发送不必要的身份证件、住址或其他敏感资料。</p>,
          },
        ]}
      />
    </>
  )
}
