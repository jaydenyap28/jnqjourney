'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin-fetch'

type Preview = {
  eligibleFiles: number
  eligibleMB: number
  batchSize: number
  excludedFolders: string[]
  requiresConfirmation: string
}

export default function StorageCleanupPage() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleted, setDeleted] = useState(0)
  const [message, setMessage] = useState('')

  async function refresh() {
    setChecking(true)
    try {
      const response = await adminFetch('/api/admin/storage-cleanup', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'Unable to verify storage.')
      setPreview(data)
      setMessage('')
    } catch (error) {
      setPreview(null)
      setMessage(String(error instanceof Error ? error.message : error))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function clean() {
    if (!preview || running || confirmation !== preview.requiresConfirmation) return
    if (!window.confirm('将永久删除已核实迁移到 R2 的旧 Supabase Gallery 备份。不会删除封面、笔记、攻略与无法核实的照片。确认继续？')) return
    setRunning(true)
    setDeleted(0)
    setMessage('正在逐批核对 R2 图片并清理旧副本...')
    try {
      let count = 0
      for (let batch = 0; batch < 40; batch++) {
        const response = await adminFetch('/api/admin/storage-cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: preview.requiresConfirmation }),
        })
        const data = await response.json()
        if (!response.ok) throw Error(data.error || 'Storage deletion failed.')
        const removed = Number(data.removed || 0)
        count += removed
        setDeleted(count)
        if (!removed || Number(data.remainingEstimate || 0) === 0) break
        setMessage('已安全清理 ' + count + ' 个旧文件，正在继续核对...')
      }
      setMessage('清理请求完成。请查看下面重新核对后的剩余数量。')
    } catch (error) {
      setMessage('已暂停，未通过的批次不会删除：' + String(error instanceof Error ? error.message : error))
    } finally {
      setRunning(false)
      setConfirmation('')
      await refresh()
    }
  }

  return (
    <main className="min-h-screen bg-[#060914] px-5 py-12 text-white md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="text-sm text-amber-200/80 hover:text-amber-100">← 返回后台</Link>
        <p className="mt-9 text-xs tracking-[0.25em] text-emerald-300">STORAGE MAINTENANCE</p>
        <h1 className="mt-3 text-3xl font-semibold">Supabase 旧图片安全清理</h1>
        <p className="mt-4 text-sm leading-7 text-white/60">
          只检查早期 Supabase Gallery 中，能关联迁移前备份、现行 Spot 已使用 R2，
          且未被现行网站及公开游记/笔记资料引用的图片。删除前还会检查对应 R2 图片是否可以读取。
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-medium">检查结果</h2>
          {checking ? (
            <p className="mt-4 text-sm text-white/60">正在重新检查现行资料、R2 与 Storage...</p>
          ) : preview ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="text-sm text-white/50">符合清理条件的旧文件</p>
                <p className="mt-2 text-3xl font-semibold">{preview.eligibleFiles}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="text-sm text-white/50">预计可释放空间</p>
                <p className="mt-2 text-3xl font-semibold">{preview.eligibleMB.toFixed(2)} MB</p>
              </div>
            </div>
          ) : null}
          <p className="mt-5 text-sm leading-7 text-white/60">
            不清理：现有地区封面、配套图、_system 版本快照、无法匹配的旧图，
            以及任何仍被现行页面引用的文件。
          </p>
          <button type="button" onClick={() => void refresh()} disabled={checking || running}
            className="mt-5 rounded-full border border-white/20 px-5 py-2 text-sm disabled:opacity-50">
            重新检查
          </button>
        </div>

        {preview && preview.eligibleFiles > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6">
            <h2 className="text-lg font-medium">最后确认</h2>
            <p className="mt-2 text-sm leading-7 text-white/60">
              这个操作不能撤销。清理会分批执行，每批都再次检查活跃引用及 R2 图片。
              若 Supabase 仍处于 Storage Quota 限制状态，请先恢复服务再执行。
            </p>
            <label htmlFor="confirmation" className="mt-5 block text-xs text-white/50">
              请填入确认文字：{preview.requiresConfirmation}
            </label>
            <input id="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)}
              disabled={running}
              className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-200" />
            <button type="button" onClick={() => void clean()}
              disabled={running || checking || confirmation !== preview.requiresConfirmation}
              className="mt-5 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">
              {running ? '正在逐批安全清理...' : '确认清理已迁移旧 Gallery'}
            </button>
          </div>
        ) : null}

        {running ? <p className="mt-5 text-sm text-emerald-300">本次已执行清理：{deleted} 个文件</p> : null}
        {message ? <p role="status" className="mt-5 break-words text-sm leading-7 text-amber-200">{message}</p> : null}
      </div>
    </main>
  )
}
