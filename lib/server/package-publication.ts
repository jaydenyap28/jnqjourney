import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export function invalidatePackagePages(slug: string, previousSlug?: string, collection = true) {
  const slugs = [...new Set([slug,previousSlug].filter((s): s is string => !!s))]
  if (slugs.some(s => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) throw Error('Invalid package scope')
  if (collection) revalidateTag('travel-packages')
  for (const route of [...(collection ? ['/packages','/sitemap.xml'] : []),...slugs.map(s => `/packages/${s}`)]) revalidatePath(route)
}
/** Database is committed; a cache failure is partial, never replay the write. */
export function packagePublicationResponse(payload: Record<string, unknown>, packageId: number, slug: string, previousSlug?: string, collection = true) {
  try {
    invalidatePackagePages(slug,previousSlug,collection)
    return NextResponse.json({...payload,publication:{state:'invalidated',verified:false}}, {headers:{'Cache-Control':'private, no-store'}})
  } catch {
    return NextResponse.json({...payload,ok:false,persisted:true,partial:true,error:'资料已保存，但公开缓存刷新失败。请仅重试刷新，不要重复提交保存。',publication:{state:'partial',retry:{url:'/api/admin/travel-packages',body:{id:packageId,action:'revalidate-public',scope:collection?'collection':'detail',previousSlug,deletedSlug:payload.deleted ? slug : undefined}}}}, {status:503,headers:{'Cache-Control':'private, no-store'}})
  }
}
