'use client'

import { useEffect, useId, useMemo } from 'react'

interface KlookWidgetEmbedProps {
  code: string
  title?: string
  description?: string
  className?: string
  variant?: 'card' | 'banner'
}

function normalizeWidgetCode(code: string) {
  return String(code || '').trim()
}

export default function KlookWidgetEmbed({
  code,
  title = 'Klook Dynamic Widget',
  description = 'Live Klook widget',
  className = '',
  variant = 'card',
}: KlookWidgetEmbedProps) {
  const widgetCode = useMemo(() => normalizeWidgetCode(code), [code])
  const widgetId = useId().replace(/:/g, '')

  useEffect(() => {
    if (!widgetCode) return

    const container = document.getElementById(widgetId)
    if (!container) return

    container.innerHTML = widgetCode

    const scripts = Array.from(container.querySelectorAll('script'))

    scripts.forEach((oldScript) => {
      const nextScript = document.createElement('script')

      Array.from(oldScript.attributes).forEach((attribute) => {
        nextScript.setAttribute(attribute.name, attribute.value)
      })

      nextScript.text = oldScript.text || oldScript.textContent || ''
      oldScript.parentNode?.replaceChild(nextScript, oldScript)
    })

    return () => {
      if (container) container.innerHTML = ''
    }
  }, [widgetCode, widgetId])

  if (!widgetCode) return null

  const isBanner = variant === 'banner'

  return (
    <section className={className}>
      <div
        className={`overflow-hidden border border-emerald-300/18 bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(255,255,255,0.04))] shadow-[0_24px_80px_rgba(0,0,0,0.2)] ${
          isBanner ? 'rounded-[22px] p-3 md:rounded-[26px] md:p-4' : 'rounded-[24px] p-4 md:rounded-[28px] md:p-5'
        }`}
      >
        <div className={isBanner ? 'mb-3 flex flex-wrap items-end justify-between gap-3' : 'mb-4'}>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/80">Klook Widget</p>
            <h3 className={`mt-2 font-semibold text-white ${isBanner ? 'text-lg md:text-xl' : 'text-xl'}`}>{title}</h3>
            <p className={`mt-1 text-white/65 ${isBanner ? 'text-xs md:text-sm' : 'text-sm'}`}>{description}</p>
          </div>
        </div>
        <div
          id={widgetId}
          className={`klook-widget-shell overflow-hidden bg-white/95 text-slate-900 ${
            isBanner ? 'rounded-[18px] p-1.5 md:p-2' : 'rounded-[20px] p-2'
          }`}
        />
      </div>
    </section>
  )
}
