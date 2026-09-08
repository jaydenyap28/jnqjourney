import { resolveEntityDisplayName, type EntityNameSource } from '@/lib/entity-display-name'

/** Inline-safe markup: usable inside an existing heading, paragraph or link. */
export default function EntityName({ entity, locale = 'zh' }: { entity: EntityNameSource; locale?: 'zh' | 'en' }) {
  const { primary, secondary } = resolveEntityDisplayName(entity, locale)
  return <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]" data-entity-name>
    <span className="block">{primary}</span>
    {secondary ? <span className="mt-1 block text-[0.75em] font-normal leading-snug text-white/55" data-secondary-name>{secondary}</span> : null}
  </span>
}
