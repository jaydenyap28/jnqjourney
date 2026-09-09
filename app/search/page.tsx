import PublicSearch from '@/components/PublicSearch'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { readPublicGuides } from '@/lib/server/public-content-store'
import SiteFooter from '@/components/SiteFooter'
export const revalidate=3600
export const metadata={title:'搜索景点、地区和游记',alternates:{canonical:'/search'},robots:{index:false,follow:true}}
export default async function SearchPage() {
  const [data,guides]=await Promise.all([resolvePublicData(),readPublicGuides()])
  return <><main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-16 text-white"><h1 className="mb-8 text-4xl">搜索</h1><PublicSearch locale="zh" locations={data.locations} regions={data.regions} guides={guides.map(g=>({slug:g.slug,title:g.title}))}/></main><SiteFooter/></>
}
