import PublicSearch from './PublicSearch'
import SiteFooter from './SiteFooter'
import type { ComponentProps } from 'react'
export default function SearchPageView(props:ComponentProps<typeof PublicSearch>) {
  return <><main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-16 text-white"><h1 className="mb-8 text-4xl">{props.locale==='en'?'Search':'搜索'}</h1><PublicSearch {...props}/></main><SiteFooter/></>
}
