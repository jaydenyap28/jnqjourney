import { CREATORS, SOCIAL_LINKS } from '@/lib/brand'
import { absoluteUrl } from '@/lib/site'

export default function SiteStructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        url: absoluteUrl('/'),
        name: 'JnQ Journey',
        inLanguage: ['zh-CN', 'en'],
        publisher: { '@id': absoluteUrl('/#organization') },
      },
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: 'JnQ Journey',
        url: absoluteUrl('/'),
        logo: absoluteUrl('/icon.png'),
        sameAs: SOCIAL_LINKS.map((item) => item.href),
        founder: CREATORS.map((creator) => ({
          '@type': 'Person',
          '@id': absoluteUrl(`/about#${creator.id}`),
          name: creator.name,
          url: absoluteUrl(`/about#${creator.id}`),
        })),
      },
    ],
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
