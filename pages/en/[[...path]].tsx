import type { GetServerSideProps } from 'next'
import EnglishRouteAdapter from '@/components/EnglishRouteAdapter'
import type { EnglishPageData } from '@/lib/server/english-page-data'

type Props = {data: EnglishPageData} | {unavailable:true}
export const getServerSideProps: GetServerSideProps<Props> = async ({params,res}) => {
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  try {
    const { compactEnglishPageData, englishPageData } = await import('@/lib/server/english-page-data')
    const value = await englishPageData(Array.isArray(params?.path) ? params.path : [], true)
    if (!value) return {notFound: true}
    if ('redirect' in value) return {redirect: {destination:value.redirect,permanent:true}}
    return {props:JSON.parse(JSON.stringify({data:compactEnglishPageData(value.data)}))}
  } catch {
    res.statusCode = 503
    res.setHeader('Retry-After','30')
    return {props:{unavailable:true}}
  }
}
export default function EnglishPage(props: Props) {
  if ('unavailable' in props) return <main><h1>Public content temporarily unavailable</h1><p>Please try again later.</p></main>
  return <EnglishRouteAdapter data={props.data}/>
}
