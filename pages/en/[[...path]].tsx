import type { GetStaticPaths, GetStaticProps } from 'next'
import EnglishRouteAdapter from '@/components/EnglishRouteAdapter'
import { compactEnglishPageData, englishPageData, type EnglishPageData } from '@/lib/server/english-page-data'
import pilot from '@/public-data/i18n/en/records.json'

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: ['/en','/en/region','/en/guide','/en/search','/en/about',...pilot.records.map(record=>`/en${record.canonicalPath}`)],
  fallback: 'blocking',
})
export const getStaticProps: GetStaticProps<{data:EnglishPageData}> = async ({params,revalidateReason}) => {
  const value = await englishPageData(Array.isArray(params?.path) ? params.path : [],revalidateReason === 'on-demand')
  if (!value) return {notFound:true,revalidate:600}
  if ('redirect' in value) return {redirect:{destination:value.redirect,permanent:true}}
  return {props:JSON.parse(JSON.stringify({data:compactEnglishPageData(value.data)})),revalidate:600}
}
export default EnglishRouteAdapter
