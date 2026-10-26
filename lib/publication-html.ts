export interface HtmlValue { attribute: string; value: string; text?: string }
export function decodeHtml(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : Number(n)))
    .replace(/&quot;/g,'"').replace(/&#x27;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
}
/** Only server HTML counts. RSC/JSON/script strings cannot satisfy assertions. */
export function verifyHtmlValues(html: string, values: HtmlValue[]) {
  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  return values.every(({attribute,value,text}) => {
    if (!/^(?:data-jnq-[a-z-]+|href)$/.test(attribute)) return false
    const matches = [...body.matchAll(new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\s${attribute}="([^"]*)"[^>]*>`, 'gi'))]
    return matches.some(match => {
      if (decodeHtml(match[2]) !== value) return false
      if (text === undefined) return true
      const start = match.index! + match[0].length
      const end = body.indexOf(`</${match[1]}>`, start)
      return end >= 0 && decodeHtml(body.slice(start,end).replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').includes(text.replace(/\s+/g,' '))
    })
  })
}
