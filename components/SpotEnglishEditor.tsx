'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'
import { spotTranslationFields, type SpotTranslationEdits } from '@/lib/spot-localization-authoring'
import type { LocalizationRecord, TranslationStatus } from '@/lib/localization'

interface EditorData {
  revision: string
  record?: LocalizationRecord
  source: Record<typeof spotTranslationFields[number], string>
  status: TranslationStatus
  canonicalPath: string
  revalidated?: boolean
}

export default function SpotEnglishEditor({spotId}:{spotId:number}) {
  const [data,setData] = useState<EditorData | null>(null)
  const [fields,setFields] = useState<SpotTranslationEdits | null>(null)
  const [status,setStatus] = useState<TranslationStatus>('missing')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const url = `/api/admin/spot-localization/${spotId}`
  function accept(value:EditorData) {
    setData(value)
    setFields(Object.fromEntries(spotTranslationFields.map(key=>[key,value.record?.fields[key] || {source:value.source[key],text:''}])) as SpotTranslationEdits)
    setStatus(value.record?.translationStatus || 'missing')
  }
  useEffect(()=>{
    let cancelled=false
    setBusy(true)
    adminFetch(url).then(async response=>{
      const value=await response.json()
      if(!response.ok) throw Error(value.error || '无法读取英文记录')
      if(!cancelled) accept(value)
    }).catch(error=>{if(!cancelled)setMessage(error.message)}).finally(()=>{if(!cancelled)setBusy(false)})
    return ()=>{cancelled=true}
  },[url])
  async function save() {
    if(!data || !fields) return
    setBusy(true);setMessage('')
    try {
      const response=await adminFetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision,fields,translationStatus:status})})
      const value=await response.json()
      if(!response.ok) throw Error(value.error || '保存失败。请重新载入确认最新版本后重试。')
      accept(value)
      setMessage(value.revalidated?'English 已保存、发布并刷新页面。':'English 已保存并发布，但页面刷新失败；请稍后重试发布。')
    } catch(error) {setMessage(error instanceof Error?error.message:'保存失败')} finally {setBusy(false)}
  }
  return <section aria-label="Spot English translation" className="space-y-5">
    <p className="text-sm text-gray-600">编辑独立的英文译文。原名称与中文资料不会改变；原文以已保存的中文资料为准。</p>
    {data && fields ? <>
      <p role="status">当前有效状态：<strong>{data.status}</strong></p>
      {spotTranslationFields.map(key=><div key={key} className="space-y-2">
        <label htmlFor={`en-${key}`} className="block font-medium">English {key}</label>
        <details><summary className="text-sm text-gray-600">当前中文／原文</summary><p className="whitespace-pre-wrap text-sm">{data.source[key] || '（空）'}</p></details>
        {fields[key].text && fields[key].source !== data.source[key] ? <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          原文已变化，此译文已过期。请核对后修改，或确认译文仍然准确。
          <button type="button" disabled={busy} className="ml-2 underline" onClick={()=>setFields({...fields,[key]:{...fields[key],source:data.source[key]}})}>确认与当前原文一致</button>
        </div> : null}
        <textarea id={`en-${key}`} value={fields[key].text} disabled={busy} rows={key==='address'?3:7} className="w-full rounded-md border border-gray-300 p-3 text-gray-900" onChange={event=>setFields({...fields,[key]:{text:event.target.value,source:data.source[key]}})} />
      </div>)}
      <label className="block text-sm">审核状态 <select value={status} disabled={busy} onChange={event=>setStatus(event.target.value as TranslationStatus)} className="ml-2 rounded border p-2">
        <option value="missing">missing</option><option value="partial">partial</option><option value="complete">complete</option>
      </select></label>
      <p className="text-xs text-gray-500">若仍有未翻译或过期的内容，有效状态会保持 partial。</p>
      <div className="flex gap-4"><button type="button" disabled={busy} onClick={save} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy?'处理中…':'保存并发布 English'}</button>
        <a href={`/en${data.canonicalPath}`} target="_blank" rel="noreferrer" className="py-2 underline">查看英文页面</a>
      </div>
    </> : busy ? <p>正在载入 English…</p> : null}
    {message ? <p role="status" className="whitespace-pre-wrap text-sm">{message}</p> : null}
    <p className="text-xs text-gray-500">如提示版本冲突，请切回中文再打开 English，重新载入最新记录。</p>
  </section>
}
