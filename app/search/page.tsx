import SearchPageView from '@/components/SearchPageView'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { readPublicGuides } from '@/lib/server/public-content-store'
import SiteFooter from '@/components/SiteFooter'
export const revalidate=3600
export const metadata={title:'搜索景点、地区和游记',alternates:{canonical:'/search'},robots:{index:false,follow:true}}
export default async function SearchPage() {
  const [data,guides]=await Promise.all([resolvePublicData(),readPublicGuides()])
  return <SearchPageView locale="zh" locations={data.locations} regions={data.regions} guides={guides.map(g=>({slug:g.slug,title:g.title}))}/>
}
