'use client'
import { useState } from 'react'
import { assessSpotContent, cleanSpotEditorialDraft } from '@/lib/spot-content-quality'

export default function SpotContentQualityPanel({ value, category, original, onApply }: { value: string; category?: string; original?: string; onApply: (value: string) => void }) {
  const [reviewing, setReviewing] = useState(false)
  const result = assessSpotContent({ description: value, category })
  const issues = result.issues.map(issue => issue.message)
  const cleaned = cleanSpotEditorialDraft(value)
  return <aside className="mt-3 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
    <p className="font-semibold">内容检查 · {result.category.label} · {result.characters} 字符（不会自动保存）</p>
    <p className="mt-2 leading-6 text-slate-600">{result.category.guidance} 短文提示仅供参考，不影响保存；个人体验在独立区域维护。</p>
    <ul className="my-2 list-inside list-disc space-y-1">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
    {!issues.length && <p className="mt-2">未发现静态规则可识别的问题，仍须人工核对事实。</p>}
    {(original !== undefined && original !== value || cleaned !== value.trim()) && <button type="button" className="min-h-11 underline underline-offset-4" aria-expanded={reviewing} onClick={() => setReviewing(!reviewing)}>预览原文与草稿对比</button>}
    {reviewing && <div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">{[['载入时原文', original ?? value], ['当前草稿', value]].map(([title, text]) => <div className="min-w-0" key={title}><h4 className="mb-2 font-medium">{title}</h4><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border bg-white p-3 font-sans leading-7">{text}</pre></div>)}</div>
      {cleaned !== value.trim() && <div className="mt-4"><h4 className="font-medium">段落清理建议</h4><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words border bg-white p-3 font-sans leading-7">{cleaned}</pre><p className="mt-2">仅清理完全重复段落及明确包装语，不补写事实；体验、照片与独有章节须人工确认。</p><button type="button" className="mt-2 min-h-11 rounded bg-slate-900 px-4 text-white" onClick={() => { onApply(cleaned); setReviewing(false) }}>采用到表单草稿，仍需另行保存</button></div>}
    </div>}
  </aside>
}
