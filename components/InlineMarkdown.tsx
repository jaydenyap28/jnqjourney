import { Fragment } from 'react'

import { parseInlineMarkdown } from '@/lib/notes'

export default function InlineMarkdown({ children }: { children?: string | null }) {
  return (
    <>
      {parseInlineMarkdown(children).map((token, index) => {
        if (token.type === 'bold') {
          return <strong key={index} className="font-semibold text-white">{token.value}</strong>
        }
        if (token.type === 'italic') {
          return <em key={index}>{token.value}</em>
        }
        if (token.type === 'code') {
          return <code key={index} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.88em] text-amber-100">{token.value}</code>
        }
        if (token.type === 'link') {
          const isExternal = /^https?:\/\//i.test(token.href)
          return (
            <a key={index} href={token.href} className="font-medium text-amber-200 underline decoration-amber-300/50 underline-offset-4 transition hover:text-amber-100" {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}>
              {token.value}
            </a>
          )
        }
        return <Fragment key={index}>{token.value}</Fragment>
      })}
    </>
  )
}
