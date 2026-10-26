import type { GetStaticPaths, GetStaticProps } from 'next'
import EnglishRouteAdapter from '@/components/EnglishRouteAdapter'
import { compactEnglishPageData, englishPageData, type EnglishPageData } from '@/lib/server/english-page-data'
import pilot from '@/public-data/i18n/en/records.json'

export const getStaticPaths: GetStaticPaths = async () => {
  // A pilot identity can become an alias in the published snapshot. Next 14
  // rejects getStaticProps redirects during build; keep aliases runtime-only.
  const identities = await Promise.all(pilot.records.map(async record => {
    const result = await englishPageData(record.canonicalPath.split('/').filter(Boolean))
    return result && 'redirect' in result ? null : `/en${record.canonicalPath}`
  }))
  return { paths: [...new Set(['/en','/en/region','/en/guide','/en/search','/en/about',...identities.filter((value): value is string => value !== null)])], fallback: 'blocking' }
}
export const getStaticProps: GetStaticProps<{data:EnglishPageData}> = async ({params,revalidateReason}) => {
  // Every runtime regeneration needs current snapshots. A first blocking visit
  // is also 'stale' in Next 14; reusing the 60s process Map can miss new slugs.
  const value = await englishPageData(Array.isArray(params?.path) ? params.path : [],revalidateReason !== 'build')
  if (!value) return {notFound:true,revalidate:3600}
  if ('redirect' in value) return {redirect:{destination:value.redirect,permanent:true}}
  return {props:JSON.parse(JSON.stringify({data:compactEnglishPageData(value.data)})),revalidate:3600}
}
export default EnglishRouteAdapter
