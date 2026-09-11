'use client'
import {usePublicLocale} from './PublicLocale'
import { resolveEntityDisplayName, type EntityNameSource } from '@/lib/entity-display-name'

/** Inline-safe markup: usable inside an existing heading, paragraph or link. */
export default function EntityName({ entity, locale }: { entity: EntityNameSource & {title?:string}; locale?: 'zh' | 'en' }) {
  const inheritedLocale=usePublicLocale()
  const { primary, secondary } = resolveEntityDisplayName((locale || inheritedLocale)==='en' && entity.title && entity.title!==entity.name ? {name:entity.title,name_cn:entity.name_cn || entity.name}:entity, locale || inheritedLocale)
  return <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]" data-entity-name>
    <span className="block">{primary}</span>
    {secondary ? <span className="mt-1 block text-[0.75em] font-normal leading-snug text-white/55" data-secondary-name>{secondary}</span> : null}
  </span>
}
