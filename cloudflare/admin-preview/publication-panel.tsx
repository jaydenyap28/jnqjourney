'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

export default function PublicationPanel() {
  const [status, setStatus] = useState('正在读取发布状态…')
  useEffect(() => {
    let current = true
    void adminFetch('/publication').then(async response => {
      if (!response.ok) throw new Error()
      const result = await response.json()
      if (current) setStatus(result.message)
    }).catch(() => { if (current) setStatus('发布状态暂不可读。') })
    return () => { current = false }
  }, [])
  return <p role="status" className="px-4 py-2 text-xs text-amber-100">{status}</p>
}
