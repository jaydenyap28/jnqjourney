'use client'

import { useEffect, useId, useMemo } from 'react'

interface KlookWidgetEmbedProps {
  code: string
  title?: string
  description?: string
  className?: string
}

function normalizeWidgetCode(code: string) {
  return String(code || '').trim()
}

export default function KlookWidgetEmbed({
  code,
  title = 'Klook Dynamic Widget',
  description = 'Live Klook widget',
  className = '',
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

  return (
    <section className={className}>
      <div className="overflow-hidden rounded-[24px] border border-emerald-300/18 bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(255,255,255,0.04))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.2)] md:rounded-[28px] md:p-5">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/80">Klook Widget</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-white/65">{description}</p>
        </div>
        <div
          id={widgetId}
          className="klook-widget-shell overflow-hidden rounded-[20px] bg-white/95 p-2 text-slate-900"
        />
      </div>
    </section>
  )
}
